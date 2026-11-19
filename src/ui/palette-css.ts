import type { Palette } from '../core/palettes';

/** A swatch-sized preview of a palette, read top → bottom like the wallpaper. */
export function paletteGradient({ stops: s }: Palette): string {
  return `linear-gradient(160deg, ${s.far} 0%, ${s.sky} 30%, ${s.haze} 46%, ${s.glow} 53%, ${s.core} 60%, ${s.under} 68%, ${s.deep} 84%, ${s.abyss} 100%)`;
}
