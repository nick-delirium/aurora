import { hexToOklab, type Vec3 } from '../core/color';
import type { Palette } from '../core/palettes';
import type { Params } from '../core/params';
import { mulberry32 } from '../core/rng';

/** Flat, GPU-ready description of one wallpaper. */
export interface SceneUniforms {
  seed: Float32Array; // vec4
  wFreq: Float32Array; // vec3
  wPhase: Float32Array; // vec3
  wAmp: Float32Array; // vec3
  wSpeed: Float32Array; // vec3, rad/s at 1× speed
  tilt: number;
  pos: Float32Array; // vec2
  amp: number;
  freq: number;
  width: number;
  angle: number;
  warp: number;
  variation: number;
  vignette: number;
  intensity: number;
  grain: number;
  grainSize: number;
  bg: Float32Array; // 6 × vec3 OKLab
  bgPos: Float32Array; // 6 floats
  glow: Float32Array;
  core: Float32Array;
  under: Float32Array;
}

const TAU = Math.PI * 2;

export function buildScene(params: Params, palette: Palette): SceneUniforms {
  const r = mulberry32(Math.imul(params.seed + 1, 7919) ^ 0x5bd1e995);
  const wFreq = [2.0 + r() * 1.6, 4.4 + r() * 2.4, 8.5 + r() * 3.5];
  const wPhase = [r() * TAU, r() * TAU, r() * TAU];
  const wAmp = [0.15 + r() * 0.05, 0.05 + r() * 0.04, 0.012 + r() * 0.014];
  const tilt = (r() - 0.5) * 0.5;
  const seed = [r() * 100, r() * 100, r() * 100, r() * 100];
  // Separate stream so adding motion didn't change the look of existing seeds.
  const rs = mulberry32(Math.imul(params.seed + 1, 104729) ^ 0x27d4eb2f);
  const sign = () => (rs() < 0.5 ? -1 : 1);
  const wSpeed = [sign() * (0.07 + rs() * 0.08), sign() * (0.1 + rs() * 0.14), sign() * (0.16 + rs() * 0.16)];

  const st = palette.stops;
  const lab = (hex: string) => hexToOklab(hex);
  const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // "Expand" pushes the colors toward the edges and keeps the edges brighter.
  const ex = params.expand;
  const up = params.reachUp * (ex ? 1.9 : 1);
  const down = params.reachDown * (ex ? 1.9 : 1);
  const dark = params.edgeDark * (ex ? 0.45 : 1);
  const sky = lab(st.sky);
  const deep = lab(st.deep);
  // Edge tones slide from the palette's dark ends toward the neighbouring color.
  const far = mix(sky, lab(st.far), dark);
  const abyss = mix(deep, lab(st.abyss), dark);

  return {
    seed: new Float32Array(seed),
    wFreq: new Float32Array(wFreq),
    wPhase: new Float32Array(wPhase),
    wAmp: new Float32Array(wAmp),
    wSpeed: new Float32Array(wSpeed),
    tilt,
    pos: new Float32Array([params.posX, params.posY]),
    amp: params.amplitude,
    freq: params.frequency,
    width: params.width,
    angle: (params.angle * Math.PI) / 180,
    warp: params.warp,
    variation: params.variation,
    vignette: params.vignette * (ex ? 0.6 : 1),
    intensity: params.intensity,
    grain: params.grain ? params.grainAmount : 0,
    grainSize: params.grainSize,
    bg: new Float32Array([far, sky, lab(st.haze), lab(st.under), deep, abyss].flat()),
    // Inner stops hug the ribbon; outer stops stretch with the reach controls.
    bgPos: new Float32Array([1.05 * up, 0.42 * up, 0.12, -0.06, -0.5 * down, -1.0 * down]),
    glow: new Float32Array(lab(st.glow)),
    core: new Float32Array(lab(st.core)),
    under: new Float32Array(lab(st.under)),
  };
}
