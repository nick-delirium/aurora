<!--
  The floating glass control panel.
    layout="side"   — desktop: right-hand column, full labels, sticky actions.
    layout="bottom" — mobile: compact sheet. Device/resolution live in the save
                      sheet, the palette opens from a swatch next to play, and
                      position is set by dragging the wallpaper.
-->
<script lang="ts">
  import type { Attachment } from 'svelte/attachments';
  import { SPEED_RANGE, type AppAPI, type AppState, type ExportResult, type Format } from '../../app/api';
  import { getPalette } from '../../core/palettes';
  import { DEFAULT_PARAMS, EXPERT_PARAMS, PARAM_SPEC, type SliderParam } from '../../core/params';
  import { MAX_SEED } from '../../core/rng';
  import { glass } from '../glass';
  import { paletteGradient } from '../palette-css';
  import { toast } from '../toast.svelte';
  import Icon from './Icon.svelte';
  import OutputOptions from './OutputOptions.svelte';
  import Segmented from './Segmented.svelte';
  import Slider from './Slider.svelte';
  import Swatches from './Swatches.svelte';
  import Switch from './Switch.svelte';

  interface Props {
    app: AppAPI;
    s: AppState;
    layout: 'side' | 'bottom';
    /** Lets the parent measure the panel (to keep framed previews clear of it). */
    measure: Attachment<HTMLElement>;
    onhide: () => void;
    /** Desktop: an export finished. */
    ondeliver: (result: ExportResult) => void;
    /** Mobile: open the save sheet (device, resolution, save). */
    onsave: () => void;
  }

  let { app, s, layout, measure, onhide, ondeliver, onsave }: Props = $props();

  let expertOpen = $state(false);
  let paletteOpen = $state(false);
  let busy = $state(false);
  let progress = $state(0);

  const formatLabel = $derived(s.format === 'jpeg' ? 'JPEG' : 'PNG');
  const swatch = $derived(paletteGradient(getPalette(s.params.palette)));

  const setParam = (key: SliderParam) => (v: number) =>
    app.setParams(key === 'grainAmount' || key === 'grainSize' ? { [key]: v, grain: true } : { [key]: v });

  async function save() {
    if (busy) return;
    busy = true;
    progress = 0;
    try {
      ondeliver(await app.exportImage((p) => (progress = p)));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Export failed');
    } finally {
      busy = false;
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(app.getShareUrl());
      toast('Link copied — it recreates this exact wallpaper');
    } catch {
      toast('Could not copy the link');
    }
  }

  function reset() {
    app.resetParams();
    toast('Adjustments reset');
  }

  // Swipe the grab handle down to hide the sheet (tap works too).
  let grabStart = -1;
  function grabDown(e: PointerEvent) {
    grabStart = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function grabMove(e: PointerEvent) {
    if (grabStart >= 0 && e.clientY - grabStart > 28) {
      grabStart = -1;
      onhide();
    }
  }
  function grabUp() {
    if (grabStart >= 0) onhide();
    grabStart = -1;
  }
</script>

{#snippet slider(key: SliderParam, inline = false)}
  {@const spec = PARAM_SPEC[key]}
  <Slider
    label={spec.label}
    value={s.params[key]}
    min={spec.min}
    max={spec.max}
    step={spec.step}
    format={spec.format}
    defaultValue={DEFAULT_PARAMS[key]}
    {inline}
    onchange={setParam(key)}
  />
{/snippet}

{#snippet speedSlider(inline: boolean)}
  <Slider
    label="Live speed"
    value={s.speed}
    min={SPEED_RANGE.min}
    max={SPEED_RANGE.max}
    step={SPEED_RANGE.step}
    format={(v) => `${v.toFixed(2)}×`}
    defaultValue={SPEED_RANGE.default}
    {inline}
    onchange={(v) => app.setSpeed(v)}
  />
{/snippet}

{#snippet expert()}
  <div class="drawer" class:open={expertOpen} inert={!expertOpen}>
    <div class="drawer-inner">
      <div class="drawer-body">
        {#if layout === 'bottom'}
          {@render speedSlider(true)}
        {/if}
        {#each EXPERT_PARAMS as key (key)}
          {@render slider(key, layout === 'bottom')}
        {/each}
        <div class="row">
          <span class="label">Seed</span>
          <div class="seed">
            <input
              class="field"
              type="number"
              inputmode="numeric"
              min="0"
              max={MAX_SEED}
              value={s.params.seed}
              aria-label="Seed"
              onchange={(e) => app.setParams({ seed: Number(e.currentTarget.value) })}
            />
            <button class="btn btn-sm btn-icon" title="New seed" aria-label="New seed" onclick={app.shuffle}>
              <Icon name="dice" />
            </button>
          </div>
        </div>
        {#if layout === 'side'}
          <div class="row">
            <span class="label">Format</span>
            <Segmented
              label="File format"
              compact
              options={[
                { id: 'png', label: 'PNG' },
                { id: 'jpeg', label: 'JPEG' },
              ]}
              value={s.format}
              onchange={(id) => app.setFormat(id as Format)}
            />
          </div>
        {/if}
        <div class="row tools">
          <button class="btn btn-sm" onclick={copyLink}><Icon name="link" />Copy link</button>
          <button class="btn btn-sm" onclick={reset}><Icon name="reset" />Reset</button>
        </div>
      </div>
    </div>
  </div>
{/snippet}

<aside
  class="panel glass"
  data-layout={layout}
  aria-label="Wallpaper controls"
  {@attach glass({ bezel: 40, thickness: 84, aberration: 0.04, specular: 0.3, blur: 4 })}
  {@attach measure}
>
  {#if layout === 'side'}
    <header class="head">
      <div class="brand"><span class="mark"></span>Aurora</div>
      <button class="btn btn-icon btn-ghost" title="Hide controls (H)" aria-label="Hide controls" onclick={onhide}>
        <Icon name="eyeOff" />
      </button>
    </header>

    <div class="scroll">
      <section>
        <h3>Wallpaper for</h3>
        <OutputOptions {app} {s} />
      </section>

      <section>
        <h3>Palette</h3>
        <Swatches
          value={s.params.palette}
          onselect={(id) => app.setParams({ palette: id })}
          onrandom={app.randomPalette}
        />
      </section>

      <section>
        <h3>Adjust</h3>
        {@render slider('posY')}
        {@render slider('intensity')}
        <div class="row">
          <span class="label">Expand colors</span>
          <Switch label="Expand colors" checked={s.params.expand} onchange={(v) => app.setParams({ expand: v })} />
        </div>
        <div class="row">
          <span class="label">Film grain</span>
          <Switch label="Film grain" checked={s.params.grain} onchange={(v) => app.setParams({ grain: v })} />
        </div>
        <div class="row">
          <span class="label live-label">
            Live motion
            {#if s.live}<span class="live-dot" aria-hidden="true"></span>{/if}
          </span>
          <Switch label="Live motion (L)" checked={s.live} onchange={(v) => app.setLive(v)} />
        </div>
        {#if s.live}
          {@render speedSlider(false)}
        {/if}
      </section>

      <section>
        <button class="disclosure" aria-expanded={expertOpen} onclick={() => (expertOpen = !expertOpen)}>
          <Icon name="sliders" />
          <span>Expert controls</span>
          <Icon name="chevron" class="chev" />
        </button>
        {@render expert()}
      </section>
    </div>

    <footer class="foot">
      <button class="btn" onclick={app.shuffle} title="New wave shape (R)"><Icon name="shuffle" />Shuffle</button>
      <button class="btn btn-primary save" disabled={busy} onclick={save} aria-live="polite">
        {#if busy}
          <Icon name="spinner" class="spin" />
          {Math.round(progress * 100)}%
        {:else}
          <Icon name="download" />
          Save {formatLabel}
        {/if}
      </button>
    </footer>
  {:else}
    <button
      class="grab"
      aria-label="Hide controls"
      onpointerdown={grabDown}
      onpointermove={grabMove}
      onpointerup={grabUp}
      onpointercancel={() => (grabStart = -1)}
    >
      <span class="pill"></span>
      <span class="caption">Touch the image to hide · drag to reposition</span>
    </button>

    <div class="scroll">
      {@render slider('intensity', true)}

      <div class="row chips">
        <button class="chip" aria-pressed={s.params.grain} onclick={() => app.setParams({ grain: !s.params.grain })}>
          <Icon name="grain" />Grain
        </button>
        <button class="chip" aria-pressed={s.params.expand} onclick={() => app.setParams({ expand: !s.params.expand })}>
          <Icon name="expand" />Expand
        </button>
        <button class="chip" aria-expanded={expertOpen} aria-pressed={expertOpen} onclick={() => (expertOpen = !expertOpen)}>
          <Icon name="sliders" />More
        </button>
      </div>

      {@render expert()}

      <div class="drawer" class:open={paletteOpen} inert={!paletteOpen}>
        <div class="drawer-inner">
          <Swatches
            scroll
            value={s.params.palette}
            onselect={(id) => app.setParams({ palette: id })}
            onrandom={app.randomPalette}
          />
        </div>
      </div>
    </div>

    <footer class="foot">
      <button
        class="palette-btn"
        class:open={paletteOpen}
        style:--sw={swatch}
        aria-label="Palette"
        aria-expanded={paletteOpen}
        onclick={() => (paletteOpen = !paletteOpen)}
      ></button>
      <button
        class="btn btn-icon"
        class:on={s.live}
        aria-pressed={s.live}
        aria-label={s.live ? 'Pause live motion' : 'Live motion'}
        onclick={() => app.setLive(!s.live)}
      >
        <Icon name={s.live ? 'pause' : 'play'} />
      </button>
      <button class="btn btn-icon" aria-label="Shuffle" onclick={app.shuffle}><Icon name="shuffle" /></button>
      <span class="spacer"></span>
      <button class="btn btn-primary save" onclick={onsave}><Icon name="download" />Save</button>
    </footer>
  {/if}
</aside>

<style>
  .panel {
    position: absolute;
    display: flex;
    flex-direction: column;
    pointer-events: auto;
    transition:
      transform 0.55s var(--ease-out),
      opacity 0.35s var(--ease-out);
  }

  .panel[data-layout='side'] {
    --g-radius: 30px;
    top: 16px;
    right: 16px;
    width: 332px;
    max-height: calc(100dvh - 32px);
  }

  .panel[data-layout='bottom'] {
    --g-radius: 30px;
    transition: none; /* showing pops back instantly; hiding animates (below) */
    left: max(10px, env(safe-area-inset-left));
    right: max(10px, env(safe-area-inset-right));
    bottom: max(10px, env(safe-area-inset-bottom));
    max-width: 560px;
    margin: 0 auto;
  }

  :global(.is-hidden) .panel[data-layout='side'] {
    transform: translateX(calc(100% + 32px));
    opacity: 0;
    pointer-events: none;
  }

  :global(.is-hidden) .panel[data-layout='bottom'],
  :global(.has-sheet) .panel[data-layout='bottom'] {
    transition:
      transform 0.45s var(--ease-out),
      opacity 0.3s var(--ease-out);
    transform: translateY(calc(100% + 32px));
    opacity: 0;
    pointer-events: none;
  }

  /* ── side layout ── */
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 10px 2px 20px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font: 700 17px/1 var(--ui-font);
    letter-spacing: -0.01em;
  }

  .mark {
    width: 18px;
    height: 18px;
    border-radius: 6px;
    background: conic-gradient(from 210deg, #2f80e2, #ff80c4, #f99a12, #1d1fa3, #2f80e2);
    box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.5);
  }

  .scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
    padding: 0 18px;
  }

  .scroll::-webkit-scrollbar {
    display: none;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 0;
  }

  section + section {
    border-top: 0.5px solid rgba(255, 255, 255, 0.1);
  }

  h3 {
    margin: 0;
    font: 600 11px/1 var(--ui-font);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ui-text-3);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 36px;
  }

  .label {
    font-size: 13.5px;
    color: var(--ui-text-2);
  }

  .disclosure {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 4px 2px;
    border: 0;
    background: none;
    cursor: pointer;
    font: 600 14px/1 var(--ui-font);
    color: var(--ui-text-2);
  }

  .disclosure span {
    flex: 1;
    text-align: left;
  }

  .disclosure :global(.chev) {
    width: 18px;
    height: 18px;
    transition: transform 0.4s var(--ease-spring);
  }

  .disclosure[aria-expanded='true'] :global(.chev) {
    transform: rotate(180deg);
  }

  .disclosure:focus-visible {
    outline: 2px solid var(--ui-accent);
    outline-offset: 2px;
    border-radius: 8px;
  }

  .foot {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px 14px;
  }

  .panel[data-layout='side'] .foot {
    border-top: 0.5px solid rgba(255, 255, 255, 0.1);
  }

  .panel[data-layout='side'] .foot .btn {
    flex: 1;
  }

  .save {
    min-width: 96px;
    font-variant-numeric: tabular-nums;
  }

  /* ── collapsible drawers (expert controls, mobile palette row) ── */
  .drawer {
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;
    transition:
      grid-template-rows 0.45s var(--ease-out),
      opacity 0.3s var(--ease-out);
  }

  .drawer.open {
    grid-template-rows: 1fr;
    opacity: 1;
  }

  .drawer-inner {
    min-height: 0;
    overflow: hidden;
    /* room for the slider lens, which grows past the track while dragging */
    margin: 0 -12px;
    padding: 0 12px;
  }

  .drawer-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 8px 0 4px;
  }

  .seed {
    display: flex;
    gap: 8px;
  }

  .field {
    width: 100px;
    height: 34px;
    padding: 0 12px;
    border: 0;
    border-radius: 10px;
    font: 500 14px/1 var(--ui-font);
    font-variant-numeric: tabular-nums;
    background: rgba(255, 255, 255, 0.1);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.15);
    outline: none;
    user-select: text;
    -webkit-user-select: text;
  }

  .field:focus-visible {
    box-shadow:
      inset 0 1px 2px rgba(0, 0, 0, 0.15),
      0 0 0 2px var(--ui-accent);
  }

  .tools {
    justify-content: flex-start;
  }

  .live-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .live-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #ff453a;
    box-shadow: 0 0 8px #ff453a;
    animation: live-pulse 1.6s ease-in-out infinite;
  }

  @keyframes live-pulse {
    50% {
      opacity: 0.35;
    }
  }

  /* ── bottom layout ── */
  .grab {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 8px 16px 2px;
    border: 0;
    background: none;
    cursor: pointer;
    touch-action: none;
  }

  .pill {
    width: 38px;
    height: 5px;
    border-radius: 99px;
    background: rgba(255, 255, 255, 0.55);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  }

  .caption {
    font: 500 11.5px/1.2 var(--ui-font);
    color: var(--ui-text-3);
  }

  .panel[data-layout='bottom'] .scroll {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 58dvh;
    padding: 6px 14px 0;
  }

  /* never squash rows when a drawer makes the sheet scroll */
  .panel[data-layout='bottom'] .scroll > :global(*) {
    flex-shrink: 0;
  }

  .chips {
    justify-content: flex-start;
    gap: 8px;
  }

  .chips .chip {
    height: 36px;
    font-size: 13.5px;
  }

  .panel[data-layout='bottom'] .foot {
    gap: 8px;
    padding: 6px 12px 12px;
  }

  .palette-btn {
    position: relative;
    flex: none;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    cursor: pointer;
    background: var(--sw);
    box-shadow:
      inset 0 0 0 0.5px rgba(255, 255, 255, 0.45),
      inset 0 1px 1px rgba(255, 255, 255, 0.4),
      0 3px 10px rgba(0, 0, 0, 0.3);
    transition: transform 0.35s var(--ease-spring);
  }

  .palette-btn::after {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0);
    transition: box-shadow 0.2s;
  }

  .palette-btn.open::after {
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.95);
  }

  .palette-btn:active {
    transform: scale(0.9);
  }

  .spacer {
    flex: 1;
  }

  .btn.on {
    background: rgba(255, 255, 255, 0.26);
  }
</style>
