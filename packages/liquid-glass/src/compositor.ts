import { COMPOSITE_FRAG, MAX_LENSES, VERT } from './shaders.js';
import type { Lens } from './types.js';

export { MAX_LENSES };

/** Compile + link a full-screen-triangle program. Throws with the GL log on failure. */
export function createProgram(gl: WebGL2RenderingContext, fragment: string, vertex = VERT): WebGLProgram {
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error(`liquid-glass: shader compile failed: ${log}`);
    }
    return sh;
  };
  const prog = gl.createProgram()!;
  const vs = compile(gl.VERTEX_SHADER, vertex);
  const fs = compile(gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`liquid-glass: program link failed: ${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

/**
 * A mipmapped offscreen render target. Draw your background into it between
 * `begin()` and `end()`; `end()` builds the mip chain the glass blur samples.
 */
export class BackdropTarget {
  private fbo: WebGLFramebuffer | null = null;
  private tex: WebGLTexture | null = null;
  private w = 0;
  private h = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {}

  /** Bind as the render target at this size (reallocating if needed) and set the viewport. */
  begin(width: number, height: number): boolean {
    const gl = this.gl;
    if (!this.fbo || width !== this.w || height !== this.h) {
      this.dispose();
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      const levels = Math.floor(Math.log2(Math.max(width, height, 1))) + 1;
      gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA8, width, height);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(fbo);
        gl.deleteTexture(tex);
        return false;
      }
      this.fbo = fbo;
      this.tex = tex;
      this.w = width;
      this.h = height;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, width, height);
    return true;
  }

  /** Finish drawing: build mipmaps and return the texture for the compositor. */
  end(): WebGLTexture {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this.tex!;
  }

  dispose(): void {
    if (this.fbo) this.gl.deleteFramebuffer(this.fbo);
    if (this.tex) this.gl.deleteTexture(this.tex);
    this.fbo = null;
    this.tex = null;
    this.w = this.h = 0;
  }
}

/** Where the output sits and how CSS px map to its pixels. */
export interface CompositeView {
  /** Output size in device px (e.g. canvas.width / canvas.height). */
  width: number;
  height: number;
  /** Device px per CSS px (usually canvas.width / canvas.clientWidth). */
  scaleX: number;
  scaleY: number;
  /** The output's top-left corner in the same CSS-px space as the lenses (default 0, 0). */
  originX?: number;
  originY?: number;
}

const UNIFORMS = ['u_frame', 'u_size', 'u_lensCount', 'u_lensRect', 'u_lensShape', 'u_lensLight', 'u_lensBlur'] as const;

/**
 * Draws a background texture to the currently bound framebuffer with glass
 * panes refracted into it. The caller binds the output framebuffer and sets the
 * viewport; the compositor only changes the program and texture unit 0.
 */
export class GlassCompositor {
  private program: WebGLProgram;
  private loc = {} as Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
  private rect = new Float32Array(MAX_LENSES * 4);
  private shape = new Float32Array(MAX_LENSES * 4);
  private light = new Float32Array(MAX_LENSES * 4);
  private blur = new Float32Array(MAX_LENSES);

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.program = createProgram(gl, COMPOSITE_FRAG);
    for (const name of UNIFORMS) this.loc[name] = gl.getUniformLocation(this.program, name);
  }

  render(source: WebGLTexture, lenses: readonly Lens[], view: CompositeView): void {
    const gl = this.gl;
    const { width: W, height: H, scaleX: sx, scaleY: sy } = view;
    const ox = view.originX ?? 0;
    const oy = view.originY ?? 0;
    const count = Math.min(lenses.length, MAX_LENSES);
    for (let i = 0; i < count; i++) {
      const l = lenses[i];
      const o = i * 4;
      // CSS px (top-left origin) → output px (GL bottom-left origin).
      this.rect.set([(l.x - ox) * sx, H - (l.y - oy + l.height) * sy, l.width * sx, l.height * sy], o);
      this.shape.set([l.radius * sx, l.bezel * sx, l.thickness * sx, l.strength], o);
      const a = (l.lightAngle * Math.PI) / 180;
      this.light.set([l.aberration, l.specular, Math.cos(a), -Math.sin(a)], o);
      this.blur[i] = l.blur * sx;
    }
    const L = this.loc;
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(L.u_frame, 0);
    gl.uniform2f(L.u_size, W, H);
    gl.uniform1i(L.u_lensCount, count);
    gl.uniform4fv(L.u_lensRect, this.rect);
    gl.uniform4fv(L.u_lensShape, this.shape);
    gl.uniform4fv(L.u_lensLight, this.light);
    gl.uniform1fv(L.u_lensBlur, this.blur);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    this.gl.deleteProgram(this.program);
  }
}
