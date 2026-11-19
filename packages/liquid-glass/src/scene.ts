import { BackdropTarget, GlassCompositor, createProgram } from './compositor.js';
import { IMAGE_FRAG } from './shaders.js';
import { GlassTracker } from './tracker.js';
import type { GlassOptions, Lens } from './types.js';

/**
 * What the glass refracts:
 * - an image / video / canvas / ImageBitmap — drawn to fill the canvas (`fit`);
 * - or your own WebGL2 renderer: draw your scene into the currently bound
 *   framebuffer (viewport already set to `width × height` device px).
 */
export type GlassBackground =
  | TexImageSource
  | ((gl: WebGL2RenderingContext, size: { width: number; height: number }) => void);

export interface GlassSceneOptions {
  /** The canvas behind your UI (typically `position: fixed; inset: 0`). */
  canvas: HTMLCanvasElement;
  background: GlassBackground;
  /** How a media background fills the canvas. Default "cover". */
  fit?: 'cover' | 'contain' | 'stretch';
  /** Cap on devicePixelRatio for the canvas. Default 2. */
  maxPixelRatio?: number;
  /** Redraw every frame (animated canvas or custom renderer). Videos animate automatically. */
  animate?: boolean;
  /** Subtree the tracker watches for movement (default document.body). */
  root?: Node;
}

export interface GlassScene {
  readonly gl: WebGL2RenderingContext;
  /** Make an element glass. Returns a function that removes it. */
  attach(el: HTMLElement, options?: GlassOptions): () => void;
  /** Change an attached element's look. */
  update(el: HTMLElement, options: GlassOptions): void;
  /** Swap what's behind the glass. */
  setBackground(background: GlassBackground): void;
  /** Request a redraw (e.g. your background changed). Coalesced per frame. */
  render(): void;
  /** Re-measure panes for a while (after moving them from JS). */
  kick(ms?: number): void;
  dispose(): void;
}

/**
 * Batteries-included liquid glass: one canvas, a background, and any number of
 * DOM elements turned into refracting glass. Renders on demand — nothing runs
 * while nothing changes (unless `animate` or a playing video).
 */
export function createGlassScene(options: GlassSceneOptions): GlassScene {
  const { canvas } = options;
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false });
  if (!gl) throw new Error('liquid-glass: WebGL 2 is not available.');

  const fit = options.fit ?? 'cover';
  const maxDpr = options.maxPixelRatio ?? 2;
  const target = new BackdropTarget(gl);
  const compositor = new GlassCompositor(gl);
  const imageProgram = createProgram(gl, IMAGE_FRAG);
  const uImage = gl.getUniformLocation(imageProgram, 'u_image');
  const uUv = gl.getUniformLocation(imageProgram, 'u_uv');
  const uSize = gl.getUniformLocation(imageProgram, 'u_size');
  const mediaTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, mediaTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  let background = options.background;
  let uploaded: TexImageSource | null = null;
  let lenses: Lens[] = [];
  let raf = 0;
  let disposed = false;

  const tracker = new GlassTracker({
    root: options.root,
    onChange: (next) => {
      lenses = next;
      render();
    },
  });

  const sizeOf = (src: TexImageSource): [number, number] => {
    if (src instanceof HTMLVideoElement) return [src.videoWidth, src.videoHeight];
    if (src instanceof HTMLImageElement) return [src.naturalWidth, src.naturalHeight];
    if ('displayWidth' in src) return [src.displayWidth, src.displayHeight]; // VideoFrame
    return [src.width, src.height];
  };

  const isLive = (src: GlassBackground) =>
    typeof src !== 'function' &&
    ((src instanceof HTMLVideoElement && !src.paused && !src.ended) || src instanceof HTMLCanvasElement);

  const drawBackground = (width: number, height: number) => {
    if (typeof background === 'function') {
      background(gl, { width, height });
      return;
    }
    const [iw, ih] = sizeOf(background);
    if (!iw || !ih) {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    gl.bindTexture(gl.TEXTURE_2D, mediaTex);
    // Images upload once; videos and canvases every frame.
    if (uploaded !== background || isLive(background)) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, background);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      uploaded = background;
    }
    const ca = width / height;
    const ia = iw / ih;
    let sx = 1;
    let sy = 1;
    if (fit === 'cover') {
      if (ca > ia) sy = ia / ca;
      else sx = ca / ia;
    } else if (fit === 'contain') {
      if (ca > ia) sx = ca / ia;
      else sy = ia / ca;
    }
    gl.useProgram(imageProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, mediaTex);
    gl.uniform1i(uImage, 0);
    gl.uniform4f(uUv, sx, sy, (1 - sx) / 2, (1 - sy) / 2);
    gl.uniform2f(uSize, width, height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (w !== canvas.width || h !== canvas.height) {
      canvas.width = w;
      canvas.height = h;
    }
  };

  const draw = () => {
    raf = 0;
    if (disposed) return;
    resize();
    const W = canvas.width;
    const H = canvas.height;
    if (!lenses.length || !target.begin(W, H)) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      drawBackground(W, H);
    } else {
      drawBackground(W, H);
      const tex = target.end();
      gl.viewport(0, 0, W, H);
      const r = canvas.getBoundingClientRect();
      compositor.render(tex, lenses, {
        width: W,
        height: H,
        scaleX: W / Math.max(1, r.width),
        scaleY: H / Math.max(1, r.height),
        originX: r.left,
        originY: r.top,
      });
    }
    if (options.animate || isLive(background)) render();
  };

  function render() {
    if (!raf && !disposed) raf = requestAnimationFrame(draw);
  }

  const ro = new ResizeObserver(render);
  ro.observe(canvas);
  if (background instanceof HTMLVideoElement) background.addEventListener('play', render);
  if (background instanceof HTMLImageElement && !background.complete) background.addEventListener('load', render, { once: true });
  render();

  return {
    gl,
    attach: (el, o) => tracker.track(el, o),
    update: (el, o) => tracker.update(el, o),
    setBackground(next) {
      background = next;
      uploaded = null;
      if (next instanceof HTMLVideoElement) next.addEventListener('play', render);
      if (next instanceof HTMLImageElement && !next.complete) next.addEventListener('load', render, { once: true });
      render();
    },
    render,
    kick: (ms) => tracker.kick(ms),
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      tracker.dispose();
      target.dispose();
      compositor.dispose();
      gl.deleteProgram(imageProgram);
      gl.deleteTexture(mediaTex);
    },
  };
}
