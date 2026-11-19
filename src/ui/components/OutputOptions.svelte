<!-- Device + resolution (+ custom size) — shared by the desktop panel and the mobile save sheet. -->
<script lang="ts">
  import type { AppAPI, AppState, Quality } from '../../app/api';
  import Segmented from './Segmented.svelte';
  import TargetSelect from './TargetSelect.svelte';

  let { app, s }: { app: AppAPI; s: AppState } = $props();

  // AppAPI getters read the same store `s` came from; touching `s` makes them reactive.
  const target = $derived.by(() => (void s.targetId, void s.custom, void s.deviceLabel, app.getTarget()));
  const groups = $derived(app.getTargetGroups());
  const quality = $derived.by(() => (void s.targetId, void s.custom, app.getQualityOptions()));
  const options = $derived(quality.map((q) => ({ id: q.id, label: q.label, sub: `${q.width}×${q.height}` })));

  function setSize(axis: 'width' | 'height', raw: string) {
    const v = Number(raw);
    if (Number.isFinite(v) && v > 0) app.setCustomSize({ ...s.custom, [axis]: v });
  }
</script>

<TargetSelect
  {groups}
  value={s.targetId}
  deviceLabel={s.deviceLabel}
  title={target.isAuto ? `This device · ${target.label}` : target.label}
  sub={`${target.width} × ${target.height}${target.isAuto ? ' · detected' : ''}`}
  onchange={(id) => app.setTarget(id)}
/>

{#if s.targetId === 'custom'}
  <div class="size">
    <input
      class="field"
      type="number"
      inputmode="numeric"
      min="64"
      max="16384"
      value={s.custom.width}
      aria-label="Width in pixels"
      onchange={(e) => setSize('width', e.currentTarget.value)}
    />
    <span>×</span>
    <input
      class="field"
      type="number"
      inputmode="numeric"
      min="64"
      max="16384"
      value={s.custom.height}
      aria-label="Height in pixels"
      onchange={(e) => setSize('height', e.currentTarget.value)}
    />
    <span>px</span>
  </div>
{/if}

<Segmented label="Resolution" {options} value={s.quality} onchange={(id) => app.setQuality(id as Quality)} />

<style>
  .size {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--ui-text-3);
  }

  .field {
    flex: 1;
    min-width: 0;
    height: 34px;
    padding: 0 12px;
    border: 0;
    border-radius: 10px;
    font: 500 14px/1 var(--ui-font);
    font-variant-numeric: tabular-nums;
    color: var(--ui-text);
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
</style>
