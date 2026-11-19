<!--
  The floating glass control panel.
    layout="side"   — desktop: right-hand column, full labels, sticky actions.
    layout="bottom" — mobile: compact sheet. Device/resolution live in the save
                      sheet, the palette opens from a swatch next to play, and
                      position is set by dragging the wallpaper. The expert
                      drawer opens upward (rows below it never move).
-->
<script lang="ts">
  import type { Attachment } from 'svelte/attachments';
  import { SPEED_RANGE, type AppAPI, type AppState, type ExportResult, type Format } from '../../app/api';
  import { getPalette } from '../../core/palettes';
  import { DEFAULT_PARAMS, EXPERT_GROUPS, PARAM_SPEC, type SliderParam } from '../../core/params';
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
    /** Hidden or covered by a sheet: take the panel out of the tab order. */
    inert?: boolean;
    /** First visit: show the "touch to hide · drag to reposition" caption. */
    showCaption?: boolean;
    /** Lets the parent measure the panel (to keep framed previews clear of it). */
    measure: Attachment<HTMLElement>;
    onhide: () => void;
    /** Desktop: an export finished. */
    ondeliver: (result: ExportResult) => void;
    /** Mobile: open the save sheet (device, resolution, save). */
    onsave: () => void;
  }

  let { app, s, layout, inert = false, showCaption = false, measure, onhide, ondeliver, onsave }: Props = $props();

  let expertOpen = $state(false);
  let paletteOpen = $state(false);
  let group = $state(EXPERT_GROUPS[0].id);
  let busy = $state(false);
  let saved = $state(false);
  let progress = $state(0);

  const swatch = $derived(paletteGradient(getPalette(s.params.palette)));
  const quality = $derived.by(() => (void s.targetId, void s.custom, void s.quality, app.getQualityOptions()));
  const selected = $derived(quality.find((q) => q.id === s.quality) ?? quality[0]);
  const groupParams = $derived(EXPERT_GROUPS.find((g) => g.id === group)?.params ?? []);

  const setParam = (key: SliderParam) => (v: number) =>
    app.setParams(key === 'grainAmount' || key === 'grainSize' ? { [key]: v, grain: true } : { [key]: v });

  async function save() {
    if (busy) return;
    busy = true;
    progress = 0;
    try {
      ondeliver(await app.exportImage((p) => (progress = p)));
      saved = true;
      setTimeout(() => (saved = false), 2400);
    } catch (err) {
      toast(`Couldn't save: ${err instanceof Error ? err.message : 'unknown error'}. Try a smaller size.`);
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
    toast('Adjustments reset', { action: { label: 'Undo', run: () => app.undo() } });
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

{#snippet tools()}
  <div class="row tools">
    <input
      class="field"
      type="number"
      inputmode="numeric"
      min="0"
      max={MAX_SEED}
      value={s.params.seed}
      aria-label="Seed"
      title="Seed — the number behind this wave shape"
      onchange={(e) => app.setParams({ seed: Number(e.currentTarget.value) })}
    />
    <button class="btn btn-sm" onclick={copyLink}><Icon name="link" />Copy link</button>
    <button class="btn btn-sm" onclick={reset}><Icon name="reset" />Reset</button>
  </div>
{/snippet}

<aside
  class="panel lg-glass"
  data-layout={layout}
  aria-label="Wallpaper controls"
  {inert}
  {@attach glass({ bezel: 40, thickness: 84, aberration: 0.04, specular: 0.3, blur: 4 })}
  {@attach measure}
>
  {#if layout === 'side'}
    <header class="head">
      <div class="brand"><span class="mark"></span>Aurora</div>
      <div class="head-actions">
        <button class="btn btn-icon btn-ghost" title="Undo (⌘Z)" aria-label="Undo" disabled={!s.canUndo} onclick={() => app.undo()}>
          <Icon name="undo" />
        </button>
        <button class="btn btn-icon btn-ghost" title="Redo (⇧⌘Z)" aria-label="Redo" disabled={!s.canRedo} onclick={() => app.redo()}>
          <Icon name="redo" />
        </button>
        <button class="btn btn-icon btn-ghost" title="Hide controls (H)" aria-label="Hide controls" onclick={onhide}>
          <Icon name="eyeOff" />
        </button>
      </div>
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
        <div class="drawer" class:open={expertOpen} inert={!expertOpen}>
          <div class="drawer-inner">
            <div class="drawer-body">
              {#each EXPERT_GROUPS as g (g.id)}
                <h4>{g.label}</h4>
                {#each g.params as key (key)}
                  {@render slider(key)}
                {/each}
              {/each}
              <h4>Output</h4>
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
              {@render tools()}
            </div>
          </div>
        </div>
      </section>
    </div>

    <footer class="foot">
      <button class="btn shuffle" onclick={app.shuffle} title="New wave shape (R)"><Icon name="shuffle" />Shuffle</button>
      <button class="btn btn-primary save" class:saved disabled={busy} onclick={save}>
        {#if busy}
          <Icon name="spinner" class="spin" />
          Saving {Math.round(progress * 100)}%
        {:else if saved}
          <Icon name="check" />
          Saved
        {:else}
          <Icon name="download" />
          Save {selected.width} × {selected.height}
        {/if}
      </button>
    </footer>
  {:else}
    <div class="grab-zone">
      <button
        class="grab"
        aria-label="Hide controls"
        onpointerdown={grabDown}
        onpointermove={grabMove}
        onpointerup={grabUp}
        onpointercancel={() => (grabStart = -1)}
      >
        <span class="pill"></span>
      </button>
      {#if showCaption && !expertOpen}
        <p class="caption">Touch the image to hide · drag to reposition</p>
      {/if}
    </div>

    <!-- Opens upward with its own capped scroll: the rows below never move. -->
    <div class="drawer expert-drawer" class:open={expertOpen} inert={!expertOpen}>
      <div class="drawer-inner">
        <div class="groups">
          <Segmented
            label="Control group"
            options={EXPERT_GROUPS.map((g) => ({ id: g.id, label: g.label }))}
            value={group}
            onchange={(id) => (group = id)}
          />
        </div>
        <div class="drawer-scroll">
          {#each groupParams as key (key)}
            {@render slider(key, true)}
          {/each}
          {#if group === 'texture' && s.live}
            {@render speedSlider(true)}
          {/if}
        </div>
        {@render tools()}
      </div>
    </div>

    <div class="rows">
      {@render slider('intensity', true)}
      <div class="row chips">
        <button class="chip" aria-pressed={s.params.grain} onclick={() => app.setParams({ grain: !s.params.grain })}>
          <Icon name="grain" />Grain
        </button>
        <button
          class="chip"
          aria-pressed={s.params.expand}
          title="Spread the colors to the edges"
          onclick={() => app.setParams({ expand: !s.params.expand })}
        >
          <Icon name="expand" />Expand colors
        </button>
        <button class="chip" aria-expanded={expertOpen} onclick={() => (expertOpen = !expertOpen)}>
          <Icon name="sliders" />More
        </button>
      </div>
    </div>

    <div class="drawer" class:open={paletteOpen} inert={!paletteOpen}>
      <div class="drawer-inner palette-row">
        <Swatches
          scroll
          value={s.params.palette}
          onselect={(id) => app.setParams({ palette: id })}
          onrandom={app.randomPalette}
        />
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
      <button class="btn btn-icon" aria-label="Undo" disabled={!s.canUndo} onclick={() => app.undo()}>
        <Icon name="undo" />
      </button>
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
    --lg-radius: 30px;
    top: 16px;
    right: 16px;
    width: 332px;
    max-height: calc(100dvh - 32px);
  }

  .panel[data-layout='bottom'] {
    --lg-radius: 30px;
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

  /* While a slider is dragged, everything else steps back so the wallpaper reads. */
  .panel :global(:is(.ctl, .row, .head, .grab-zone, .groups, .foot, h3, h4, section > .disclosure)) {
    transition: opacity 0.25s var(--ease-out);
  }

  .panel:has(:global(.slider.active)) :global(:is(.ctl, .row, .head, .grab-zone, .groups, .foot, h3, h4, section > .disclosure, .swatches, .seg)):not(:has(:global(.slider.active))) {
    opacity: 0.16;
  }

  /* ── side layout ── */
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 8px 2px 20px;
  }

  .head-actions {
    display: flex;
    gap: 2px;
  }

  .head-actions .btn {
    width: 38px;
    height: 38px;
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
    border-top: 0.5px solid rgba(255, 255, 255, 0.12);
  }

  h3 {
    margin: 0;
    font: 600 12px/1 var(--ui-font);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ui-text-3);
  }

  h4 {
    margin: 10px 0 0;
    font: 600 13px/1 var(--ui-font);
    color: var(--ui-text);
  }

  h4:first-child {
    margin-top: 4px;
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

  .foot {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px 14px;
  }

  .panel[data-layout='side'] .foot {
    border-top: 0.5px solid rgba(255, 255, 255, 0.12);
  }

  .panel[data-layout='side'] .shuffle {
    flex: 1 1 0;
  }

  .panel[data-layout='side'] .save {
    flex: 1.6 1 0;
    padding: 0 14px;
  }

  .save {
    min-width: 96px;
    font-variant-numeric: tabular-nums;
  }

  .save.saved {
    background: #fff;
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

  .field {
    width: 96px;
    height: 36px;
    padding: 0 12px;
    border: 0;
    border-radius: 10px;
    font: 500 14px/1 var(--ui-font);
    font-variant-numeric: tabular-nums;
    background: rgba(255, 255, 255, 0.12);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.15);
    outline: none;
    user-select: text;
    -webkit-user-select: text;
  }

  .tools {
    justify-content: flex-start;
    gap: 8px;
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
  .grab-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0 16px;
  }

  .grab {
    display: grid;
    place-items: center;
    width: 100%;
    height: 28px;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
    touch-action: none;
  }

  .pill {
    width: 40px;
    height: 5px;
    border-radius: 99px;
    background: rgba(255, 255, 255, 0.6);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
  }

  .caption {
    margin: -2px 0 4px;
    font: 500 12px/1.2 var(--ui-font);
    color: var(--ui-text-3);
    text-align: center;
  }

  .expert-drawer .drawer-inner {
    display: flex;
    flex-direction: column;
  }

  .groups {
    padding: 4px 2px 6px;
  }

  .drawer-scroll {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: min(26dvh, 240px);
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
    /* room for the slider lens */
    margin: 0 -12px;
    padding: 0 12px;
  }

  .drawer-scroll::-webkit-scrollbar {
    display: none;
  }

  .expert-drawer .tools {
    padding: 6px 0 4px;
    border-bottom: 0.5px solid rgba(255, 255, 255, 0.12);
    margin-bottom: 6px;
  }

  .expert-drawer,
  .rows {
    padding: 0 14px;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .chips {
    justify-content: flex-start;
    flex-wrap: wrap; /* very narrow phones */
    gap: 8px;
    min-height: 44px;
  }

  .chips .chip {
    height: 44px;
    font-size: 14px;
    padding: 0 13px 0 11px;
  }

  .palette-row {
    padding: 2px 14px 0;
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
