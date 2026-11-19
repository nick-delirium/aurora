# @nick-delirium/liquid-glass

Refracting "liquid glass" panes over a WebGL-rendered background: a convex rim
that bends light by Snell's law, colour fringes, soft blur and a rim highlight —
identical in Chrome, Firefox and (iOS) Safari, rendered in one cheap GPU pass.
Framework-agnostic, no dependencies.

The glass refracts **what you draw**: an image, a video, a canvas, or your own
WebGL scene. (It can't refract arbitrary HTML behind it — no browser exposes
that to WebGL. For glass over other UI there's `overlayGlass`, Chromium only.)

## Quick start

```ts
import { createGlassScene } from '@nick-delirium/liquid-glass';
import '@nick-delirium/liquid-glass/glass.css';

const scene = createGlassScene({
  canvas: document.querySelector('#bg'), // behind your UI, e.g. position: fixed; inset: 0
  background: myImageOrVideoOrCanvas,    // or (gl, { width, height }) => { /* draw */ }
});

scene.attach(document.querySelector('.card'));                // tuned defaults
scene.attach(document.querySelector('.pill'), { bezel: 18, thickness: 34, blur: 3 });
```

```html
<canvas id="bg"></canvas>
<div class="card lg-glass">…</div>
```

Give glass elements the `lg-glass` class: it supplies the tint, rim light and
shadow (and a CSS frosted fallback when not tracked). The pane's shape follows
the element's box and `border-radius`; it stays aligned through CSS
transitions, transforms, fades (opacity fades the refraction too), resizes and
Svelte transitions. Moving things from JS in ways the DOM doesn't reveal? Call
`scene.kick()`.

Rendering is on demand — nothing runs while nothing changes — unless you pass
`animate: true` (animated canvas/custom renderer) or the background is a
playing video.

## Options

| Option | Default | |
|---|---|---|
| `bezel` | `40` | Width of the curved rim, px |
| `thickness` | `84` | Height of the glass edge — taller bends more, px |
| `blur` | `4` | Blur behind the glass, px |
| `aberration` | `0.04` | 0–0.3, colour fringing at the rim |
| `specular` | `0.3` | 0–1, rim highlight |
| `lightAngle` | `-120` | Light direction in degrees (screen space, y down) |

CSS custom properties on `.lg-glass`: `--lg-radius`, `--lg-tint`,
`--lg-tint-rgb`, `--lg-blur` (frosted fallback).

## Bring your own renderer

If your app already renders with WebGL2, compose the pieces yourself (this is
what Aurora does):

```ts
import { BackdropTarget, GlassCompositor, GlassTracker } from '@nick-delirium/liquid-glass';

const target = new BackdropTarget(gl);
const compositor = new GlassCompositor(gl);
let lenses = [];
const tracker = new GlassTracker({ onChange: (l) => { lenses = l; requestDraw(); } });
tracker.track(panelEl, { blur: 6 });

function draw() {
  if (lenses.length && target.begin(canvas.width, canvas.height)) {
    drawMyScene();                       // into the mipmapped target
    const tex = target.end();
    gl.viewport(0, 0, canvas.width, canvas.height);
    compositor.render(tex, lenses, {
      width: canvas.width, height: canvas.height,
      scaleX: canvas.width / canvas.clientWidth, scaleY: canvas.height / canvas.clientHeight,
    });
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    drawMyScene();                       // no glass on screen: single pass
  }
}
```

Lenses are in CSS px, viewport coordinates (`getBoundingClientRect` space);
`originX/originY` in the view handle canvases that don't start at the viewport
corner. Up to `MAX_LENSES` (8) panes at once.

## Also included

- `overlayGlass(el, { magnify })` — SVG displacement as `backdrop-filter` for
  glass over other UI (e.g. a slider knob magnifying its track). Chromium only;
  no-op elsewhere (style the fallback with `:not(.lg-refractive)`).
- `detectGlassMode()` — `'lite'` when the user prefers reduced transparency or
  more contrast (or `?glass=lite`); skip `attach` then and the CSS fallback
  shows a solid panel.

## How it works

The background renders into a mipmapped texture; a composite pass copies it to
the screen and, under each pane's rim, samples it at a refracted position: the
rim is a convex squircle; a vertical ray bends by Snell's law (IOR 1.5) and lands
offset in proportion to the glass height there. R, G and B sample at slightly
different offsets; the inside is blurred from the mip chain; the rim highlight
depends on the edge normal vs. the light direction.

Debug tip: refraction is nearly invisible on smooth gradients — test over
stripes.

## Demo & build

```sh
npx vite packages/liquid-glass/demo   # from the Aurora repo root
npm run build                         # in this folder → dist/ (ESM + .d.ts + glass.css)
```

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — noncommercial use only; commercial use
requires permission from [@nick-delirium](https://github.com/nick-delirium).
