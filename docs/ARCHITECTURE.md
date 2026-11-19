# Aurora — architecture & notes

How the generator, the glass and the UI fit together. For setup, see the [README](../README.md).

## Architecture

```
src/
  core/     pure logic + data, no rendering
            params (schema/ranges), palettes, OKLab color, seeded RNG,
            device detection, preview framing, URL-hash encoding
  engine/   WebGL2 renderer — knows nothing about the UI
            shaders.ts (the whole look), scene.ts (params → uniforms),
            renderer.ts (on-demand preview + tiled export), export.ts
  app/      api.ts       ← the contract the UI is allowed to use
            controller.ts  wires core + engine, owns state, URL sync
  ui/       Svelte 5 — talks to the app ONLY through AppAPI
  main.ts   the one place that connects engine, app and UI
```

**The UI is a separate layer.** `src/ui` imports types from `app/api.ts` and
static data from `core/` (palettes, param specs) — never the engine. You can
redesign it, or replace Svelte entirely, by writing a new `mountUI(root, app)`.

### How the image is made

One fragment shader (`engine/shaders.ts`):

1. Pixels map into a resolution-independent space (short side = 1), so a phone
   wallpaper is a crop of the same field a desktop one shows, and 4K exports
   look identical to the preview.
2. A seeded wave (3 sines + low-frequency noise) is the ribbon's spine; `d` is
   the signed distance to it.
3. Background = smooth OKLab gradient indexed by `d`; the ribbon's glow / core /
   under bands are composited on top, with width and glow varying along it.
4. Lightness-only vignette → sRGB → film grain → triangular dither (no banding).

Exports render in 2048² tiles into a 2D canvas, so size is only capped by the
browser's canvas limit (16.7 MP on Safari/iOS, ~50 MP elsewhere).

### Live mode

`params.time` is part of the wallpaper. Live mode just advances it (~30 fps,
paused in background tabs): wave phases drift at seeded speeds, the noise
flows, glow hotspots travel along the ribbon, glow and amplitude breathe. All
motion terms are zero at `time = 0`. Saving while live exports the frame on
screen, and the time is in the URL/filename, so every moment is reproducible.

### Device detection (`core/devices.ts`)

CSS screen size × `devicePixelRatio` identifies iPhones/iPads exactly (Apple
ships a small fixed set of sizes) and gives the real render resolution on
Android, Mac and PC. Chromium on Android also reports the model name via
User-Agent Client Hints. iPad targets are square so they survive rotation.

### Liquid glass (`ui/glass.ts`, `engine/shaders.ts` → `COMPOSITE_FRAG`)

Glass panels that float over the wallpaper are **drawn by the engine**. The UI
registers each panel's rounded rect via `app.setGlass()`. While any glass is on
screen, the wallpaper renders into a mipmapped texture and a second, cheap pass
composites it to the canvas: under each panel's rim it samples the texture at a
refracted position (per colour channel), blurs via mip taps, and adds a rim
highlight. No glass on screen → a single pass straight to the canvas. No DOM
copies or SVG filters, so it is identical in every browser (including iOS
Safari), in sync with live mode, and costs nothing while nothing changes. The
DOM element only adds tint, light and content. Exports never include it.

Optics (after [kube.io's write-up](https://kube.io/blog/liquid-glass-css-svg/)):
the rim is a convex squircle surface, vertical rays bend by Snell's law
(IOR 1.5), offset ∝ glass height; R/G/B bend slightly differently (chromatic
aberration); a light-angle rim highlight is screened on top.

`ui/glass.ts` keeps engine rects aligned with the DOM: it re-measures every
frame for a short window whenever something may move (CSS transitions, class or
style mutations, Svelte intro/outro events, resizes) and only pushes changes.
Opacity (including ancestors) fades the refraction with the element.

Glass over *other UI* (slider knobs magnifying their track) can't come from the
wallpaper, so `overlayGlass` uses an SVG displacement filter as
`backdrop-filter` — Chromium only; WebKit/Firefox get a CSS approximation.

Modes: `lens` (default) and `lite` (reduced transparency / more contrast, or
`?glass=lite`): CSS blur only.

**Debugging:** `?debug=stripes` replaces the preview wallpaper with stripes —
smooth gradients hide almost any bend.

Use it on any element: `<div class="glass" {@attach glass({ bezel: 20 })}>`.

Why not the alternatives (researched): html2canvas snapshots
(liquid-glass-js) freeze an animated background and cost one WebGL context per
element; SVG `backdrop-filter: url()` is Chromium-only; SVG `filter: url()` on a
copy of the background works in WebKit but needs a per-frame canvas copy and
hits WebKit quirks (user-space `feImage` coordinates resolve against the page;
filter output is cached per `<filter>` element; maps decode asynchronously).

### Notes

- TypeScript is pinned to 6.x: `svelte-check` doesn't support TS 7 yet.
- State lives in the URL hash, so every wallpaper is a shareable link.
- Shortcuts: `H` hide/show controls, `R` shuffle, `L` / `Space` live mode.
  Drag (or two-finger scroll) the wallpaper to move the wave; on touch, tap the
  wallpaper to hide controls.
