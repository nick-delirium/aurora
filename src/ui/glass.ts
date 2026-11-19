/**
 * Aurora's glass wiring. The glass itself lives in @nick-delirium/liquid-glass
 * (packages/liquid-glass): the tracker keeps DOM panes measured, the app hands
 * them to the engine, and the engine's compositor refracts the wallpaper.
 *
 *   <div class="lg-glass" {@attach glass({ bezel: 40 })}>
 */
import {
  GlassTracker,
  detectGlassMode,
  overlayGlass as svgOverlayGlass,
  type GlassOptions,
  type Lens,
  type OverlayGlassOptions,
} from '@nick-delirium/liquid-glass';
import type { Attachment } from 'svelte/attachments';

export const glassMode = detectGlassMode();

let tracker: GlassTracker | null = null;

/** Connect the UI's panes to whoever draws them (the app). Call before mounting. */
export function setGlassHost(host: { setGlass(lenses: Lens[]): void }): void {
  tracker?.dispose();
  tracker = new GlassTracker({
    root: document.getElementById('ui') ?? undefined,
    onChange: (lenses) => host.setGlass(lenses),
  });
}

/** Glass over the wallpaper: refraction drawn by the engine. */
export function liquidGlass(el: HTMLElement, options: GlassOptions = {}): () => void {
  if (glassMode === 'lite' || !tracker) return () => {};
  return tracker.track(el, options);
}

/** Glass over other UI (a knob magnifying its track): SVG backdrop filter, Chromium only. */
export function overlayGlass(el: HTMLElement, options: OverlayGlassOptions = {}): () => void {
  if (glassMode === 'lite') return () => {};
  return svgOverlayGlass(el, options);
}

/** Svelte attachment: <div class="lg-glass" {@attach glass({ ... })}>. */
export function glass(options: GlassOptions = {}): Attachment<HTMLElement> {
  return (el) => liquidGlass(el, options);
}
