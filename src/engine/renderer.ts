import type { Size } from '../core/devices';
import type { Rect } from '../core/frame';
import type { SceneUniforms } from './scene';
import { BackdropTarget, GlassCompositor, MAX_LENSES, createProgram, type Lens } from '@nick-delirium/liquid-glass';
import { FRAG } from './shaders';

export type { Lens };

const UNIFORMS = [
  'u_origin', 'u_scale', 'u_target', 'u_seed', 'u_wFreq', 'u_wPhase', 'u_wAmp', 'u_wSpeed', 'u_tilt', 'u_time',
  'u_pos', 'u_amp', 'u_freq', 'u_width', 'u_angle', 'u_warp', 'u_var', 'u_vignette',
  'u_intensity', 'u_grain', 'u_grainSize', 'u_bg', 'u_bgPos', 'u_glow', 'u_core', 'u_under', 'u_debug',
] as const;


/** ?debug=stripes — preview shows stripes, to judge glass refraction. Never affects exports. */
const DEBUG_STRIPES = new URLSearchParams(location.search).get('debug') === 'stripes';
type UniformName = (typeof UNIFORMS)[number];

/**
 * WebGL2 renderer. Renders on demand: the preview is redrawn only when the
 * scene, the view, the glass panels or the animation time changes.
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private loc = {} as Record<UniformName, WebGLUniformLocation | null>;
  /** Glass: the wallpaper renders into this mipmapped target, then the compositor refracts it. */
  private backdrop: BackdropTarget | null = null;
  private compositor: GlassCompositor | null = null;
  private scene: SceneUniforms | null = null;
  private frame: Rect = { x: 0, y: 0, width: 1, height: 1 };
  private target: Size = { width: 1, height: 1 };
  private time = 0;
  private raf = 0;
  private lost = false;
  private lenses: Lens[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL 2 is not available in this browser.');
    this.gl = gl;
    this.init();

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.init();
      this.requestRender();
    });
    this.resize();
  }

  private init(): void {
    const gl = this.gl;
    this.program = createProgram(gl, FRAG);
    for (const name of UNIFORMS) this.loc[name] = gl.getUniformLocation(this.program, name);
    this.backdrop = new BackdropTarget(gl);
    this.compositor = new GlassCompositor(gl);
  }

  /** Match the drawing buffer to the canvas' CSS size × devicePixelRatio. */
  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (w !== this.canvas.width || h !== this.canvas.height) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.requestRender();
    }
  }

  /** Glass panels to draw over the preview. */
  setLenses(lenses: Lens[]): void {
    this.lenses = lenses.slice(0, MAX_LENSES);
    this.requestRender();
  }

  /** Animation clock in seconds (live mode). */
  setTime(t: number): void {
    if (t === this.time) return;
    this.time = t;
    this.requestRender();
  }

  setScene(scene: SceneUniforms): void {
    this.scene = scene;
    this.requestRender();
  }

  /** frame: where the target sits on screen (CSS px); target: composition size in px. */
  setView(frame: Rect, target: Size): void {
    this.frame = frame;
    this.target = target;
    this.requestRender();
  }

  requestRender(): void {
    if (this.raf || this.lost) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.drawPreview();
    });
  }

  private drawPreview(): void {
    if (!this.scene || !this.program) return;
    const gl = this.gl;
    const c = this.canvas;
    const sx = c.width / Math.max(1, c.clientWidth);
    const sy = c.height / Math.max(1, c.clientHeight);
    const ox = this.frame.x * sx;
    const oy = c.height - (this.frame.y + this.frame.height) * sy;
    const scale = this.target.width / (this.frame.width * sx);

    // No glass on screen: one pass straight to the canvas.
    const glass = this.lenses.length > 0 && this.backdrop!.begin(c.width, c.height);
    if (!glass) {
      if (!this.lenses.length) this.backdrop?.dispose();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, c.width, c.height);
      this.draw(this.scene, this.time, ox, oy, scale, this.target, true);
      return;
    }

    // Glass: wallpaper → mipmapped texture → composite (refraction, blur, light).
    this.draw(this.scene, this.time, ox, oy, scale, this.target, true);
    const tex = this.backdrop!.end();
    gl.viewport(0, 0, c.width, c.height);
    this.compositor!.render(tex, this.lenses, { width: c.width, height: c.height, scaleX: sx, scaleY: sy });
  }

  private draw(
    s: SceneUniforms,
    time: number,
    ox: number,
    oy: number,
    scale: number,
    target: Size,
    preview = false,
  ): void {
    const gl = this.gl;
    const L = this.loc;
    gl.useProgram(this.program);
    gl.uniform2f(L.u_origin, ox, oy);
    gl.uniform1f(L.u_scale, scale);
    gl.uniform2f(L.u_target, target.width, target.height);
    gl.uniform4fv(L.u_seed, s.seed);
    gl.uniform3fv(L.u_wFreq, s.wFreq);
    gl.uniform3fv(L.u_wPhase, s.wPhase);
    gl.uniform3fv(L.u_wAmp, s.wAmp);
    gl.uniform3fv(L.u_wSpeed, s.wSpeed);
    gl.uniform1f(L.u_tilt, s.tilt);
    gl.uniform1f(L.u_time, time);
    gl.uniform2fv(L.u_pos, s.pos);
    gl.uniform1f(L.u_amp, s.amp);
    gl.uniform1f(L.u_freq, s.freq);
    gl.uniform1f(L.u_width, s.width);
    gl.uniform1f(L.u_angle, s.angle);
    gl.uniform1f(L.u_warp, s.warp);
    gl.uniform1f(L.u_var, s.variation);
    gl.uniform1f(L.u_vignette, s.vignette);
    gl.uniform1f(L.u_intensity, s.intensity);
    gl.uniform1f(L.u_grain, s.grain);
    gl.uniform1f(L.u_grainSize, s.grainSize);
    gl.uniform3fv(L.u_bg, s.bg);
    gl.uniform1fv(L.u_bgPos, s.bgPos);
    gl.uniform3fv(L.u_glow, s.glow);
    gl.uniform3fv(L.u_core, s.core);
    gl.uniform3fv(L.u_under, s.under);
    gl.uniform1i(L.u_debug, preview && DEBUG_STRIPES ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * Render the current scene at an arbitrary resolution, in tiles, into a 2D
   * canvas. Tiling sidesteps GPU texture/viewport limits; the only hard cap is
   * the browser's 2D canvas size.
   */
  async renderImage(width: number, height: number, onProgress?: (p: number) => void): Promise<HTMLCanvasElement> {
    // Snapshot: live mode keeps animating the preview while we export this moment.
    const scene = this.scene;
    const time = this.time;
    if (!scene || !this.program) throw new Error('Nothing to render yet.');
    if (this.lost) throw new Error('The graphics context was lost. Reload the page.');
    const gl = this.gl;
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const maxVp = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    const tile = Math.min(2048, maxTex, maxVp[0], maxVp[1]);

    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error(`This browser can't allocate a ${width}×${height} image. Try a lower resolution.`);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, tile, tile);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb);
      gl.deleteTexture(tex);
      throw new Error('Could not create an offscreen render target.');
    }

    const buf = new Uint8Array(tile * tile * 4);
    const total = Math.ceil(width / tile) * Math.ceil(height / tile);
    let done = 0;
    try {
      for (let ty = 0; ty < height; ty += tile) {
        for (let tx = 0; tx < width; tx += tile) {
          const tw = Math.min(tile, width - tx);
          const th = Math.min(tile, height - ty);
          gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
          gl.viewport(0, 0, tw, th);
          // GL's origin is bottom-left; this tile covers target rows [height-ty-th, height-ty).
          this.draw(scene, time, -tx, -(height - ty - th), 1, { width, height });
          gl.readPixels(0, 0, tw, th, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          const img = ctx.createImageData(tw, th);
          const row = tw * 4;
          for (let y = 0; y < th; y++) {
            img.data.set(buf.subarray((th - 1 - y) * row, (th - y) * row), y * row);
          }
          ctx.putImageData(img, tx, ty);
          onProgress?.(++done / total);
          await new Promise((r) => setTimeout(r, 0));
        }
      }
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb);
      gl.deleteTexture(tex);
      this.requestRender();
    }
    return out;
  }
}
