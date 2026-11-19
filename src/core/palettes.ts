import { oklchToHex } from './color';
import { mulberry32 } from './rng';

/**
 * A palette is 8 named stops, read along the distance from the ribbon:
 *   far   – far above the ribbon (top of the sky)
 *   sky   – upper background
 *   haze  – light haze right above the ribbon
 *   glow  – the warm halo on the ribbon's upper edge
 *   core  – the ribbon's bright core
 *   under – bright band just below the ribbon
 *   deep  – lower background
 *   abyss – far below the ribbon
 */
export interface PaletteStops {
  far: string;
  sky: string;
  haze: string;
  glow: string;
  core: string;
  under: string;
  deep: string;
  abyss: string;
}

export interface Palette {
  id: string;
  name: string;
  stops: PaletteStops;
}

const p = (id: string, name: string, s: string): Palette => {
  const [far, sky, haze, glow, core, under, deep, abyss] = s.split(/\s+/);
  return { id, name, stops: { far, sky, haze, glow, core, under, deep, abyss } };
};

export const PALETTES: Palette[] = [
  p('aurora', 'Aurora', '#05060f #2f80e2 #d2b6e4 #f99a12 #ff80c4 #2f7ff0 #1d1fa3 #080737'),
  p('ultraviolet', 'Ultraviolet', '#06020f #4a1c9c #c7a3ff #ff5fa8 #ffd0ec #7b46ff #2a0b78 #090222'),
  p('sunset', 'Sunset', '#140b29 #5b2d8a #f59bb0 #ffb547 #ff6b5e #9b55e0 #301566 #0c051c'),
  p('ember', 'Ember', '#0b0503 #6a1e0e #f2a06b #ffd66b #fff0c9 #ff6236 #7d150f #1a0404'),
  p('rose', 'Rose', '#12060c #6b1f45 #f4bfd6 #ffd6a5 #ff7aa8 #c0428a #4a0f35 #14030d'),
  p('lagoon', 'Lagoon', '#031419 #126b7d #bfe8dc #ffd27a #ff8a6e #1fb5a8 #0a4f63 #021116'),
  p('reef', 'Reef', '#04161f #135a6a #b5e2d6 #ffc1a6 #ff6f75 #2aa39a #133a62 #050d1d'),
  p('mint', 'Mint', '#020a07 #0f4a39 #a6f0cf #f0ff8c #c5ffe1 #19b98a #0a5544 #021511'),
  p('citrus', 'Citrus', '#0c1607 #3a6e22 #e4f5a8 #fff27a #ffb21a #59c26a #17502a #041008'),
  p('midnight', 'Midnight', '#000000 #0b1640 #5a6bd8 #8ef0ff #e0fbff #3a4bff #10126b #02021a'),
  p('glacier', 'Glacier', '#e9f0f8 #b7cff0 #f4f7fc #a8dcff #ffffff #7fa8ea #3e60b6 #182466'),
  p('silver', 'Silver', '#060607 #30343b #b4b9c3 #f1f3f7 #ffffff #707886 #24272d #09090b'),
];

export const GENERATED_PREFIX = 'gen-';

/** Harmonious random palette built in OKLCH from a seed. */
export function generatePalette(n: number): Palette {
  const r = mulberry32((n ^ 0x9e3779b9) >>> 0);
  const h = r() * 360;
  const warm = h + 120 + r() * 120;
  const coreH = warm + (r() < 0.5 ? -1 : 1) * (25 + r() * 35);
  const c = 0.75 + r() * 0.45;
  const light = r() < 0.12;
  const L = light
    ? { far: 0.95, sky: 0.83, haze: 0.96, glow: 0.86, core: 0.93, under: 0.7, deep: 0.5, abyss: 0.28 }
    : { far: 0.12, sky: 0.5, haze: 0.84, glow: 0.8, core: 0.77, under: 0.62, deep: 0.34, abyss: 0.15 };
  return {
    id: `${GENERATED_PREFIX}${n}`,
    name: 'Generated',
    stops: {
      far: oklchToHex(L.far, 0.03 * c, h),
      sky: oklchToHex(L.sky, 0.15 * c, h),
      haze: oklchToHex(L.haze, 0.06 * c, h + 35),
      glow: oklchToHex(L.glow, 0.17 * c, warm),
      core: oklchToHex(L.core, 0.18 * c, coreH),
      under: oklchToHex(L.under, 0.18 * c, h - 12),
      deep: oklchToHex(L.deep, 0.17 * c, h + 10),
      abyss: oklchToHex(L.abyss, 0.08 * c, h + 18),
    },
  };
}

export function getPalette(id: string): Palette {
  if (id.startsWith(GENERATED_PREFIX)) {
    const n = Number(id.slice(GENERATED_PREFIX.length));
    if (Number.isFinite(n)) return generatePalette(n);
  }
  return PALETTES.find((pal) => pal.id === id) ?? PALETTES[0];
}
