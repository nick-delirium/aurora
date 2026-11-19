/**
 * liquid-glass — refracting glass panes over a WebGL-rendered background.
 *
 * Batteries included:
 *   const scene = createGlassScene({ canvas, background: img });
 *   scene.attach(document.querySelector('.card'));
 *   // + import '@nick-delirium/liquid-glass/glass.css' and add class "lg-glass"
 *
 * Bring your own renderer: draw your scene into a BackdropTarget, track panes
 * with GlassTracker, and composite with GlassCompositor.
 */
export { GLASS_DEFAULTS, type GlassOptions, type Lens } from './types.js';
export { detectGlassMode, isChromium, type GlassMode } from './support.js';
export { BackdropTarget, GlassCompositor, MAX_LENSES, createProgram, type CompositeView } from './compositor.js';
export { GlassTracker, type GlassTrackerOptions } from './tracker.js';
export { overlayGlass, type OverlayGlassOptions } from './overlay.js';
export { createGlassScene, type GlassBackground, type GlassScene, type GlassSceneOptions } from './scene.js';
