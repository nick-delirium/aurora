<!--
  UI root. Owns: the gesture surface over the wallpaper (drag to move the wave,
  tap to hide controls on touch), the device frame for non-native targets, the
  floating panel, toasts and the export sheet.
-->
<script lang="ts">
  import { MediaQuery } from 'svelte/reactivity';
  import type { Attachment } from 'svelte/attachments';
  import type { AppAPI, AppState, ExportResult } from '../app/api';
  import SaveSheet from './components/SaveSheet.svelte';
  import Icon from './components/Icon.svelte';
  import Panel from './components/Panel.svelte';
  import Toasts from './components/Toasts.svelte';
  import { fly } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { glass, glassMode } from './glass';
  import { toast } from './toast.svelte';

  let { app }: { app: AppAPI } = $props();

  // Mirror of the app store. AppState is immutable, so $state.raw is enough.
  // (`app` never changes after mount, so reading it once here is intended.)
  // svelte-ignore state_referenced_locally
  let s: AppState = $state.raw(app.getState());
  $effect(() => app.subscribe((next) => (s = next)));

  const wide = new MediaQuery('min-width: 760px');
  const coarse = new MediaQuery('pointer: coarse');
  const layout = $derived<'side' | 'bottom'>(wide.current ? 'side' : 'bottom');

  let hidden = $state(false);
  /** null = closed; { initial: null } = options step; { initial: result } = result step. */
  let sheet: { initial: ExportResult | null } | null = $state(null);
  let hint = $state(false);
  let hintTimer = 0;

  const target = $derived.by(() => (void s.targetId, void s.custom, void s.deviceLabel, app.getTarget()));
  const frame = $derived(s.view.frame);
  const frameRadius = $derived.by(() => {
    const w = frame.width;
    switch (target.kind) {
      case 'phone':
        return Math.min(w * 0.13, 56);
      case 'tablet':
        return Math.min(w * 0.05, 28);
      default:
        return 6;
    }
  });

  function toggleHidden() {
    hidden = !hidden;
    clearTimeout(hintTimer);
    hint = hidden && (coarse.current || layout === 'bottom');
    if (hint) hintTimer = window.setTimeout(() => (hint = false), 3800);
  }

  // Report how much of the screen the panel covers, so framed previews avoid it.
  // offsetLeft/offsetTop ignore the hide/show transform.
  const measure: Attachment<HTMLElement> = (el) => {
    const report = () => {
      if (el.dataset.layout === 'side') {
        app.setViewInsets({ top: 0, left: 0, bottom: 0, right: Math.max(0, window.innerWidth - el.offsetLeft) });
      } else {
        app.setViewInsets({ top: 0, left: 0, right: 0, bottom: Math.max(0, window.innerHeight - el.offsetTop) });
      }
    };
    const ro = new ResizeObserver(report);
    ro.observe(el);
    window.addEventListener('resize', report);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', report);
    };
  };

  // ── Gestures on the wallpaper ──
  let pointer = -1;
  let start = { x: 0, y: 0, t: 0 };
  let last = { x: 0, y: 0, t: 0 };
  let dragging = $state(false);

  // Touch drags keep gliding a little after release (velocity in px/ms).
  const GLIDE_TIME = 120; // ms — exponential decay time constant; ~glide distance = speed × this
  let vel = { x: 0, y: 0 };
  let glide = 0;

  function stopGlide() {
    cancelAnimationFrame(glide);
    glide = 0;
  }

  function startGlide() {
    const speed = Math.hypot(vel.x, vel.y);
    if (speed < 0.08) return;
    const max = 1.8;
    if (speed > max) vel = { x: (vel.x * max) / speed, y: (vel.y * max) / speed };
    let prev = performance.now();
    const step = (now: number) => {
      const dt = Math.min(32, now - prev);
      prev = now;
      app.panBy(vel.x * dt, vel.y * dt);
      const decay = Math.exp(-dt / GLIDE_TIME);
      vel = { x: vel.x * decay, y: vel.y * decay };
      glide = Math.hypot(vel.x, vel.y) > 0.01 ? requestAnimationFrame(step) : 0;
    };
    glide = requestAnimationFrame(step);
  }

  function pdown(e: PointerEvent) {
    if (pointer !== -1 || e.button !== 0) return;
    stopGlide();
    pointer = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const now = performance.now();
    start = { x: e.clientX, y: e.clientY, t: now };
    last = { x: e.clientX, y: e.clientY, t: now };
    vel = { x: 0, y: 0 };
  }

  function pmove(e: PointerEvent) {
    if (e.pointerId !== pointer) return;
    if (!dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) dragging = true;
    if (!dragging) return;
    const now = performance.now();
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    const dt = Math.max(1, now - last.t);
    vel = { x: vel.x * 0.6 + (dx / dt) * 0.4, y: vel.y * 0.6 + (dy / dt) * 0.4 };
    app.panBy(dx, dy);
    last = { x: e.clientX, y: e.clientY, t: now };
  }

  function pup(e: PointerEvent) {
    if (e.pointerId !== pointer) return;
    const tap = !dragging && performance.now() - start.t < 400;
    const glides = dragging && e.pointerType !== 'mouse' && performance.now() - last.t < 80; // finger still moving
    pointer = -1;
    dragging = false;
    if (glides) startGlide();
    if (tap && e.pointerType !== 'mouse') toggleHidden();
  }

  function pcancel(e: PointerEvent) {
    if (e.pointerId !== pointer) return;
    pointer = -1;
    dragging = false;
  }

  // Trackpad two-finger scroll / mouse wheel moves the wave too (needs passive: false).
  const wheel: Attachment<HTMLElement> = (el) => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const k = e.deltaMode === 1 ? 16 : 1;
      const clampD = (v: number) => Math.max(-80, Math.min(80, v));
      app.panBy(clampD(-e.deltaX * k), clampD(-e.deltaY * k));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  };

  function onKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.key === 'h' || e.key === 'H') toggleHidden();
    else if (e.key === 'r' || e.key === 'R') app.shuffle();
    else if (e.key === 'l' || e.key === 'L' || (e.key === ' ' && t?.tagName !== 'BUTTON')) {
      e.preventDefault();
      app.setLive(!s.live);
    } else return;
  }

  function deliver(res: ExportResult) {
    if (coarse.current) {
      sheet = { initial: res };
      return;
    }
    const a = document.createElement('a');
    a.href = res.url;
    a.download = res.filename;
    document.body.append(a);
    a.click();
    a.remove();
    toast(`Saved ${res.width} × ${res.height} ${res.mime === 'image/png' ? 'PNG' : 'JPEG'}`);
    setTimeout(() => URL.revokeObjectURL(res.url), 60_000);
  }


</script>

<svelte:window onkeydown={onKey} />

<div class="ui-root" class:is-hidden={hidden} class:has-sheet={!!sheet} data-glass={glassMode}>
  <div
    class="gesture"
    class:dragging
    role="application"
    aria-label="Wallpaper preview. Drag to move the wave."
    onpointerdown={pdown}
    onpointermove={pmove}
    onpointerup={pup}
    onpointercancel={pcancel}
    {@attach wheel}
  ></div>

  {#if s.view.mode === 'contain'}
    <div
      class="frame"
      style:left="{frame.x}px"
      style:top="{frame.y}px"
      style:width="{frame.width}px"
      style:height="{frame.height}px"
      style:--r="{frameRadius}px"
    >
      <div class="frame-label">{target.label} · {target.width} × {target.height}</div>
    </div>
  {/if}

  {#key layout}
    <Panel {app} {s} {layout} {measure} onhide={toggleHidden} ondeliver={deliver} onsave={() => (sheet = { initial: null })} />
  {/key}

  {#if layout === 'side'}
    <button
      class="show glass"
      title="Show controls (H)"
      aria-label="Show controls"
      tabindex={hidden ? 0 : -1}
      onclick={toggleHidden}
      {@attach glass({ bezel: 20, thickness: 40, aberration: 0.05, specular: 0.35, blur: 2.5 })}
    >
      <Icon name="eye" />
    </button>
  {/if}

  {#if hint}
    <div
      class="hint glass"
      role="status"
      transition:fly={{ y: 16, duration: 400, easing: backOut }}
      {@attach glass({ bezel: 18, thickness: 32, aberration: 0.05, specular: 0.35, blur: 3 })}
    >
      <strong>Tap to show controls</strong>
      <span>Drag to reposition the image</span>
    </div>
  {/if}

  <Toasts />

  {#if sheet}
    <SaveSheet {app} {s} initial={sheet.initial} onclose={() => (sheet = null)} />
  {/if}
</div>

<style>
  .ui-root {
    position: absolute;
    inset: 0;
  }

  .gesture {
    position: absolute;
    inset: 0;
    pointer-events: auto;
    touch-action: none;
    cursor: grab;
  }

  .gesture.dragging {
    cursor: grabbing;
  }

  .frame {
    position: absolute;
    pointer-events: none;
    border-radius: var(--r);
    box-shadow:
      0 0 0 200vmax rgba(3, 4, 10, 0.6),
      inset 0 0 0 1px rgba(255, 255, 255, 0.22),
      0 30px 80px rgba(0, 0, 0, 0.35);
    /* no transition: must stay pixel-aligned with the canvas, which redraws instantly */
  }

  .frame-label {
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translate(-50%, 12px);
    white-space: nowrap;
    font: 500 12.5px/1 var(--ui-font);
    color: var(--ui-text-2);
    font-variant-numeric: tabular-nums;
  }

  .show {
    --g-radius: 99px;
    position: absolute;
    top: 16px;
    right: 16px;
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    padding: 0;
    border: 0;
    cursor: pointer;
    opacity: 0;
    transform: scale(0.6);
    pointer-events: none;
    transition:
      opacity 0.3s var(--ease-out),
      transform 0.5s var(--ease-spring);
  }

  .is-hidden .show {
    opacity: 1;
    transform: none;
    pointer-events: auto;
  }

  .hint {
    --g-radius: 22px;
    position: absolute;
    left: 50%;
    bottom: max(24px, calc(env(safe-area-inset-bottom) + 12px));
    translate: -50% 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 11px 20px;
    white-space: nowrap;
    pointer-events: none;
  }

  .hint strong {
    font: 600 14px/1.2 var(--ui-font);
  }

  .hint span {
    font: 500 12px/1.2 var(--ui-font);
    color: var(--ui-text-2);
  }
</style>
