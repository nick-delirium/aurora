import type { Size } from './devices';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type FrameMode = 'cover' | 'contain';

/**
 * If the target's aspect ratio is close to the viewport's (e.g. you're on the
 * device you're designing for), the preview fills the screen ("cover").
 * Otherwise the target is shown as a framed area that avoids the UI ("contain").
 */
const COVER_TOLERANCE = 0.24; // |ln(aspect ratio)| difference

export function fitFrame(
  viewport: Size,
  insets: Insets,
  target: Size,
  /** e.g. a phone previewing a phone wallpaper: fill the screen even though browser bars shorten the viewport */
  preferCover = false,
): { rect: Rect; mode: FrameMode } {
  const va = viewport.width / viewport.height;
  const ta = target.width / target.height;
  // Same orientation is enough when cover is preferred.
  const sameOrientation = va < 1 === ta < 1 || Math.abs(ta - 1) < 0.05;

  if ((preferCover && sameOrientation) || Math.abs(Math.log(ta / va)) < COVER_TOLERANCE) {
    const s = Math.max(viewport.width / target.width, viewport.height / target.height);
    const w = target.width * s;
    const h = target.height * s;
    return {
      mode: 'cover',
      rect: { x: (viewport.width - w) / 2, y: (viewport.height - h) / 2, width: w, height: h },
    };
  }

  const margin = 28;
  const labelSpace = 30;
  const ax = insets.left + margin;
  const ay = insets.top + margin;
  const aw = Math.max(80, viewport.width - insets.left - insets.right - margin * 2);
  const ah = Math.max(80, viewport.height - insets.top - insets.bottom - margin * 2 - labelSpace);
  const s = Math.min(aw / target.width, ah / target.height);
  const w = target.width * s;
  const h = target.height * s;
  return {
    mode: 'contain',
    rect: { x: ax + (aw - w) / 2, y: ay + (ah - h) / 2, width: w, height: h },
  };
}
