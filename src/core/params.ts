import { MAX_SEED } from './rng';

/** Everything that defines one wallpaper. Serializable; lives in the URL hash. */
export interface Params {
  seed: number;
  palette: string;
  /** Horizontal shift of the wave (phase). */
  posX: number;
  /** Vertical placement of the ribbon, 0 = bottom, 1 = top. */
  posY: number;
  intensity: number;
  grain: boolean;
  // expert
  amplitude: number;
  frequency: number;
  width: number;
  /** How far the colors reach above / below the ribbon before fading to the edge tones. */
  reachUp: number;
  reachDown: number;
  /** How dark the far edges get (0 = edges keep the sky/deep color, 1 = palette's dark tones). */
  edgeDark: number;
  /** Quick toggle: push the colors out to the edges. */
  expand: boolean;
  angle: number;
  warp: number;
  variation: number;
  vignette: number;
  grainAmount: number;
  grainSize: number;
  /** Animation clock (seconds). Live mode advances it; every moment is reproducible. */
  time: number;
}

type NumericKeys<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T];
export type SliderParam = Exclude<NumericKeys<Params>, 'seed' | 'time'>;

export interface ParamSpec {
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const mult = (v: number) => `${v.toFixed(2)}×`;
const deg = (v: number) => `${Math.round(v)}°`;
const signed = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}`;

export const PARAM_SPEC: Record<SliderParam, ParamSpec> = {
  posY: { label: 'Position', min: 0, max: 1, step: 0.005, format: pct },
  intensity: { label: 'Intensity', min: 0, max: 1, step: 0.01, format: pct },
  posX: { label: 'Shift', min: -2, max: 2, step: 0.01, format: signed },
  amplitude: { label: 'Waviness', min: 0, max: 2, step: 0.01, format: mult },
  frequency: { label: 'Frequency', min: 0.3, max: 2.5, step: 0.01, format: mult },
  width: { label: 'Ribbon width', min: 0.3, max: 3, step: 0.01, format: mult },
  reachUp: { label: 'Reach up', min: 0.4, max: 3, step: 0.01, format: mult },
  reachDown: { label: 'Reach down', min: 0.4, max: 3, step: 0.01, format: mult },
  edgeDark: { label: 'Edge darkness', min: 0, max: 1, step: 0.01, format: pct },
  angle: { label: 'Angle', min: -90, max: 90, step: 1, format: deg },
  warp: { label: 'Turbulence', min: 0, max: 1, step: 0.01, format: pct },
  variation: { label: 'Variation', min: 0, max: 1, step: 0.01, format: pct },
  vignette: { label: 'Vignette', min: 0, max: 1, step: 0.01, format: pct },
  grainAmount: { label: 'Grain amount', min: 0, max: 1, step: 0.01, format: pct },
  grainSize: { label: 'Grain size', min: 0.5, max: 3, step: 0.05, format: mult },
};

export const BASIC_PARAMS: SliderParam[] = ['posY', 'intensity'];

/** Expert controls in small groups (≤5 each) so no screen shows a wall of sliders. */
export const EXPERT_GROUPS: { id: string; label: string; params: SliderParam[] }[] = [
  { id: 'shape', label: 'Shape', params: ['posX', 'amplitude', 'frequency', 'angle', 'warp'] },
  { id: 'color', label: 'Color', params: ['width', 'variation', 'reachUp', 'reachDown', 'edgeDark'] },
  { id: 'texture', label: 'Texture', params: ['vignette', 'grainAmount', 'grainSize'] },
];
export const EXPERT_PARAMS: SliderParam[] = [
  'posX',
  'amplitude',
  'frequency',
  'width',
  'reachUp',
  'reachDown',
  'edgeDark',
  'angle',
  'warp',
  'variation',
  'vignette',
  'grainAmount',
  'grainSize',
];

export const DEFAULT_PARAMS: Params = {
  seed: 0,
  palette: 'aurora',
  posX: 0,
  posY: 0.42,
  intensity: 0.8,
  grain: true,
  amplitude: 1,
  frequency: 1,
  width: 1,
  reachUp: 1,
  reachDown: 1,
  edgeDark: 1,
  expand: false,
  angle: 0,
  warp: 0.35,
  variation: 0.5,
  vignette: 0.35,
  grainAmount: 0.5,
  grainSize: 1,
  time: 0,
};

export const MAX_TIME = 1_000_000;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Clamp/validate a partial params object (e.g. one parsed from a URL). */
export function sanitizeParams(patch: Partial<Params>): Partial<Params> {
  const out: Partial<Params> = {};
  for (const [key, value] of Object.entries(patch) as [keyof Params, unknown][]) {
    if (key === 'palette') {
      if (typeof value === 'string' && value) out.palette = value;
    } else if (key === 'grain' || key === 'expand') {
      if (typeof value === 'boolean') out[key] = value;
    } else if (key === 'seed') {
      if (typeof value === 'number' && Number.isFinite(value)) out.seed = clamp(Math.round(value), 0, MAX_SEED);
    } else if (key === 'time') {
      if (typeof value === 'number' && Number.isFinite(value)) out.time = clamp(value, 0, MAX_TIME);
    } else if (key in PARAM_SPEC && typeof value === 'number' && Number.isFinite(value)) {
      const spec = PARAM_SPEC[key as SliderParam];
      out[key as SliderParam] = clamp(value, spec.min, spec.max);
    }
  }
  return out;
}
