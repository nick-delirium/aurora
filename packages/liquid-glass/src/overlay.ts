/**
 * Glass over *other UI* (not over your WebGL background) — e.g. a slider knob
 * that magnifies the track under it while dragged. Uses an SVG displacement
 * filter as `backdrop-filter`, which only Chromium supports; elsewhere
 * `overlayGlass` does nothing and the element keeps its CSS look (style it via
 * `:not(.lg-refractive)`).
 *
 * Same optics as the WebGL compositor, baked into a displacement map per
 * element size: R/G = offset, B = rim highlight.
 *
 * WebKit quirks handled here (they also bite if you adapt this for
 * `filter: url()`): feImage gets no x/y/width/height (WebKit resolves
 * user-space coordinates against the page, not the element), and every update
 * builds a new <filter> element (WebKit caches output per filter element).
 */
import { isChromium } from './support.js';
import { GLASS_DEFAULTS, type GlassOptions } from './types.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

export interface OverlayGlassOptions extends GlassOptions {
  /** 0–1: lens magnification of the middle (a knob magnifying a track). Default 0. */
  magnify?: number;
  /** Index of refraction. Default 1.5. */
  ior?: number;
  /** Saturation boost of what's behind. Default 1.4. */
  saturation?: number;
}

const OVERLAY_DEFAULTS: Required<OverlayGlassOptions> = {
  ...GLASS_DEFAULTS,
  blur: 0,
  magnify: 0,
  ior: 1.5,
  saturation: 1.4,
};

/** Apply SVG refraction as backdrop-filter (Chromium only). Returns a cleanup function. */
export function overlayGlass(el: HTMLElement, options: OverlayGlassOptions = {}): () => void {
  if (!isChromium()) return () => {};
  return refractGlass(el, { ...OVERLAY_DEFAULTS, ...options });
}

// ───────────────────────── SVG plumbing ─────────────────────────

let defs: SVGDefsElement | null = null;
function getDefs(): SVGDefsElement {
  if (defs) return defs;
  const root = document.createElementNS(SVG_NS, 'svg');
  root.setAttribute('aria-hidden', 'true');
  root.setAttribute('width', '0');
  root.setAttribute('height', '0');
  root.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  defs = document.createElementNS(SVG_NS, 'defs');
  root.append(defs);
  document.body.append(root);
  return defs;
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

// ───────────────────────── Optics ─────────────────────────

const SAMPLES = 128;
const profileCache = new Map<string, Float32Array>();

/** Convex squircle: smooth rim → flat top, keeps refraction gradients soft. */
const surface = (x: number) => Math.pow(1 - Math.pow(1 - x, 4), 0.25);

/**
 * Lateral offset (px) of a vertical ray hitting the rim at x ∈ [0, 1)
 * (0 = outer edge, 1 = start of the flat top). Positive = toward the center.
 */
function refractionProfile(bezel: number, thickness: number, ior: number): Float32Array {
  const key = `${bezel}|${thickness}|${ior}`;
  const hit = profileCache.get(key);
  if (hit) return hit;
  const out = new Float32Array(SAMPLES);
  const d = 1e-3;
  for (let i = 0; i < SAMPLES; i++) {
    const x = (i + 0.5) / SAMPLES;
    const x0 = Math.max(0, x - d);
    const x1 = Math.min(1, x + d);
    const slope = ((surface(x1) - surface(x0)) / (x1 - x0)) * (thickness / bezel);
    const incidence = Math.atan(slope); // angle between the vertical ray and the surface normal
    const refracted = Math.asin(Math.sin(incidence) / ior);
    out[i] = thickness * surface(x) * Math.tan(incidence - refracted);
  }
  profileCache.set(key, out);
  return out;
}

interface GlassMap {
  url: string;
  /** feDisplacementMap scale that maps the encoded ±1 to real pixels. */
  scale: number;
}

const mapCache = new Map<string, GlassMap>();

/**
 * Displacement + specular map for a rounded rect of size w×h (radius r),
 * centered in a canvas padded by `pad` on every side (neutral there).
 */
function glassMap(w: number, h: number, r: number, pad: number, o: Required<OverlayGlassOptions>): GlassMap {
  const key = [w, h, r, pad, o.bezel, o.thickness, o.ior, o.magnify, o.specular, o.lightAngle].join('|');
  const hit = mapCache.get(key);
  if (hit) return hit;

  const W = w + pad * 2;
  const H = h + pad * 2;
  const hw = w / 2;
  const hh = h / 2;
  const rr = Math.min(r, hw, hh);
  const bezel = Math.max(1, Math.min(o.bezel, hw, hh));
  const profile = refractionProfile(bezel, o.thickness, o.ior);
  const la = (o.lightAngle * Math.PI) / 180;
  const lx = Math.cos(la);
  const ly = Math.sin(la);

  const dx = new Float32Array(W * H);
  const dy = new Float32Array(W * H);
  const spec = new Float32Array(W * H);
  let maxAbs = 1e-6;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x + 0.5 - pad - hw;
      const py = y + 0.5 - pad - hh;
      const qx = Math.abs(px) - (hw - rr);
      const qy = Math.abs(py) - (hh - rr);
      let sdf: number;
      let nx: number;
      let ny: number;
      if (qx > 0 && qy > 0) {
        const l = Math.hypot(qx, qy) || 1;
        sdf = l - rr;
        nx = (qx / l) * Math.sign(px);
        ny = (qy / l) * Math.sign(py);
      } else if (qx > qy) {
        sdf = qx - rr;
        nx = Math.sign(px);
        ny = 0;
      } else {
        sdf = qy - rr;
        nx = 0;
        ny = Math.sign(py);
      }
      const inward = -sdf;
      if (inward < 0) continue; // outside the shape: neutral
      const i = y * W + x;
      let vx = 0;
      let vy = 0;
      if (inward < bezel) {
        const t = inward / bezel;
        const m = profile[Math.min(SAMPLES - 1, Math.floor(t * SAMPLES))];
        vx -= nx * m; // convex glass pulls the image from further inside
        vy -= ny * m;
        // Rim light: brightest facing the light, dimmer on the opposite side.
        const facing = nx * lx + ny * ly;
        const k = facing > 0 ? facing : -facing * 0.45;
        spec[i] = Math.pow(1 - t, 3) * Math.pow(k, 1.6) * o.specular + Math.pow(1 - t, 6) * 0.12 * o.specular;
      }
      if (o.magnify > 0) {
        vx -= px * o.magnify;
        vy -= py * o.magnify;
      }
      dx[i] = vx;
      dy[i] = vy;
      maxAbs = Math.max(maxAbs, Math.abs(vx), Math.abs(vy));
    }
  }

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const data = img.data;
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = 128 + (dx[i] / maxAbs) * 127;
    data[i * 4 + 1] = 128 + (dy[i] / maxAbs) * 127;
    data[i * 4 + 2] = Math.min(255, spec[i] * 255);
    data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // feDisplacementMap offset = scale × (C − 0.5) and C ≈ 0.5 ± 0.5·v, so scale = 2·max.
  const result = { url: c.toDataURL('image/png'), scale: maxAbs * 2 };
  if (mapCache.size > 48) mapCache.clear();
  mapCache.set(key, result);
  return result;
}

// ───────────────────────── Filter ─────────────────────────

interface Filter {
  /**
   * Point the filter at a map (null = no bend, e.g. while a resize settles).
   */
  update(map: GlassMap | null): void;
  remove(): void;
}

const newId = () => `lg-${Math.random().toString(36).slice(2, 9)}`;

/**
 * Every update builds a fresh <filter> element and calls `apply(id)` to point
 * the element at it. WebKit caches filter output per filter element — changing
 * the map or size of an existing one leaves the old result on screen.
 */
function createFilter(o: Required<OverlayGlassOptions>, apply: (id: string) => void): Filter {
  let current: SVGFilterElement | null = null;

  const build = (map: GlassMap | null) => {
    const filter = svg('filter', {
      id: newId(),
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      filterUnits: 'objectBoundingBox',
      primitiveUnits: 'userSpaceOnUse',
      'color-interpolation-filters': 'sRGB',
    });
    // No x/y/width/height: the image fills the filter region (= the element's box).
    // WebKit resolves explicit user-space coordinates against the page, not the
    // element, which shifts the map by the element's offset.
    const image = svg('feImage', { result: 'map', preserveAspectRatio: 'none' });
    if (map) {
      image.setAttribute('href', map.url);
      image.setAttributeNS(XLINK_NS, 'xlink:href', map.url);
    }
    filter.append(svg('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: o.blur, result: 'blur' }), image);

    const displace = (result: string, k: number) =>
      svg('feDisplacementMap', {
        in: 'blur',
        in2: 'map',
        scale: map ? map.scale * k : 0,
        xChannelSelector: 'R',
        yChannelSelector: 'G',
        result,
      });

    if (map && o.aberration > 0) {
      // Displace R, G, B by slightly different amounts, then recombine.
      const only = [
        '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
        '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
        '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
      ];
      only.forEach((values, i) =>
        filter.append(
          displace(`d${i}`, 1 - o.aberration * i),
          svg('feColorMatrix', { in: `d${i}`, type: 'matrix', values, result: `c${i}` }),
        ),
      );
      filter.append(
        svg('feBlend', { in: 'c0', in2: 'c1', mode: 'screen', result: 'rg' }),
        svg('feBlend', { in: 'rg', in2: 'c2', mode: 'screen', result: 'bent' }),
      );
    } else {
      filter.append(displace('bent', 1));
    }

    filter.append(svg('feColorMatrix', { in: 'bent', type: 'saturate', values: o.saturation, result: 'sat' }));
    if (map) {
      // Specular lives in the map's blue channel: spread it to grey, then screen it on.
      filter.append(
        svg('feColorMatrix', {
          in: 'map',
          type: 'matrix',
          values: '0 0 1 0 0  0 0 1 0 0  0 0 1 0 0  0 0 0 0 1',
          result: 'spec',
        }),
        svg('feBlend', { in: 'spec', in2: 'sat', mode: 'screen' }),
      );
    }

    getDefs().append(filter);
    apply(filter.id);
    current?.remove();
    current = filter;
  };

  build(null);
  return {
    update: build,
    remove: () => current?.remove(),
  };
}

const radiusOf = (el: HTMLElement) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;

/**
 * Keeps a filter's map in sync with the element's size. Building a map costs a
 * few ms, so during resize animations (e.g. a drawer opening) the bend is
 * switched off and the exact map is built once things settle. (Stretching the
 * old map isn't an option: WebKit draws feImage at its natural size.)
 */
function mapSync(filter: Filter, o: Required<OverlayGlassOptions>, pad: number) {
  let current: GlassMap | null = null;
  let lastKey = '';
  let timer = 0;
  const sync = (w: number, h: number, r: number) => {
    const key = `${w}x${h}r${r}`;
    if (key === lastKey) return;
    lastKey = key;
    clearTimeout(timer);
    if (!current) {
      current = glassMap(w, h, r, pad, o);
      filter.update(current);
      return;
    }
    filter.update(null);
    timer = window.setTimeout(() => {
      current = glassMap(w, h, r, pad, o);
      filter.update(current);
    }, 160);
  };
  sync.dispose = () => clearTimeout(timer);
  return sync;
}

// ───────────────────────── backdrop-filter refraction ─────────────────────────

function refractGlass(el: HTMLElement, o: Required<OverlayGlassOptions>): () => void {
  el.classList.add('lg-refractive');
  const filter = createFilter(o, (id) => {
    el.style.setProperty('backdrop-filter', `url(#${id})`);
    el.style.setProperty('-webkit-backdrop-filter', `url(#${id})`);
  });

  const sync = mapSync(filter, o, 0);
  const update = () => {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w && h) sync(w, h, radiusOf(el));
  };
  const ro = new ResizeObserver(update);
  ro.observe(el);
  update();

  return () => {
    ro.disconnect();
    sync.dispose();
    filter.remove();
    el.classList.remove('lg-refractive');
    el.style.removeProperty('backdrop-filter');
    el.style.removeProperty('-webkit-backdrop-filter');
  };
}
