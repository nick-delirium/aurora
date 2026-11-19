/** How a glass pane looks. All lengths are CSS px. */
export interface GlassOptions {
  /** Width of the curved rim. */
  bezel?: number;
  /** Height of the glass edge — taller bends more. */
  thickness?: number;
  /** 0–0.3: how differently R/G/B bend (colour fringes at the rim). */
  aberration?: number;
  /** 0–1: strength of the rim highlight. */
  specular?: number;
  /** Light direction in degrees, screen space (y down). -120 = from the top-left. */
  lightAngle?: number;
  /** Blur behind the glass. */
  blur?: number;
}

/** The tuned defaults: clear, thick glass with a strong rim bend and soft blur. */
export const GLASS_DEFAULTS: Readonly<Required<GlassOptions>> = Object.freeze({
  bezel: 40,
  thickness: 84,
  aberration: 0.04,
  specular: 0.3,
  lightAngle: -120,
  blur: 4,
});

/**
 * One pane to draw: geometry in CSS px (top-left origin, same space as
 * getBoundingClientRect) plus its look.
 */
export interface Lens extends Required<GlassOptions> {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Corner radius. */
  radius: number;
  /** 0–1: fades the whole effect (e.g. while the element fades out). */
  strength: number;
}
