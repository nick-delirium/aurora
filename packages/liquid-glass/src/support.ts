/**
 * "lens"  — refracted glass (WebGL2), the default.
 * "lite"  — CSS-only frosted glass: reduced transparency / more contrast
 *           preferences, or forced with `?glass=lite`.
 */
export type GlassMode = 'lens' | 'lite';

export function detectGlassMode(): GlassMode {
  if (typeof window === 'undefined') return 'lite';
  const forced = new URLSearchParams(location.search).get('glass');
  if (forced === 'lens' || forced === 'lite') return forced;
  if (matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more)').matches) return 'lite';
  return 'lens';
}

/**
 * Chromium (Chrome, Edge, Android) — the only engine that runs SVG filters as
 * backdrop-filter. Client Hints first; brands can be empty (UA overrides, some
 * embedded builds), so fall back to the UA string. iOS Chrome ("CriOS") is WebKit.
 */
export function isChromium(): boolean {
  if (typeof navigator === 'undefined') return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
  return !!brands?.some((b) => /Chromium/i.test(b.brand)) || /Chrome\/\d/.test(navigator.userAgent);
}
