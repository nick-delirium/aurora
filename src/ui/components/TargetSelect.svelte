<!-- A glass chip over a native <select>, so phones get their own picker for free. -->
<script lang="ts">
  import type { TargetGroup } from '../../app/api';
  import Icon from './Icon.svelte';

  interface Props {
    groups: TargetGroup[];
    value: string;
    deviceLabel: string;
    title: string;
    sub?: string;
    compact?: boolean;
    onchange: (id: string) => void;
  }

  let { groups, value, deviceLabel, title, sub, compact = false, onchange }: Props = $props();
</script>

<label class="select" class:compact>
  <span class="text">
    <span class="title">{title}</span>
    {#if sub}<span class="sub">{sub}</span>{/if}
  </span>
  <Icon name="chevron" class="chev" />
  <select {value} aria-label="Wallpaper size" onchange={(e) => onchange(e.currentTarget.value)}>
    <option value="auto">This device — {deviceLabel}</option>
    {#each groups as g (g.group)}
      <optgroup label={g.group}>
        {#each g.options as o (o.id)}
          <option value={o.id}>{o.label} — {o.width}×{o.height}</option>
        {/each}
      </optgroup>
    {/each}
    <option value="custom">Custom size…</option>
  </select>
</label>

<style>
  .select {
    position: relative;
    display: flex;
    align-items: center;
    min-width: 0;
    min-height: 50px;
    padding: 7px 40px 7px 14px;
    border-radius: 16px;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.1);
    box-shadow:
      inset 0 0.5px 0 rgba(255, 255, 255, 0.25),
      inset 0 0 0 0.5px rgba(255, 255, 255, 0.06);
    transition: background-color 0.2s;
  }

  .select:hover {
    background: rgba(255, 255, 255, 0.14);
  }

  .select:has(select:focus-visible) {
    outline: 2px solid var(--ui-accent);
    outline-offset: 2px;
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .title {
    font: 600 14.5px/1.15 var(--ui-font);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sub {
    font: 500 12px/1 var(--ui-font);
    color: var(--ui-text-3);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  select {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    border: 0;
    cursor: pointer;
    font-size: 16px; /* prevents iOS zoom-on-focus */
    appearance: none;
  }

  .select :global(.chev) {
    position: absolute;
    right: 14px;
    top: 50%;
    width: 16px;
    height: 16px;
    margin-top: -8px;
    opacity: 0.6;
  }

  .compact {
    min-height: 42px;
    padding: 5px 32px 5px 14px;
    border-radius: 99px;
  }

  .compact .title {
    font-size: 13.5px;
  }

  .compact .sub {
    font-size: 11px;
  }

  .compact :global(.chev) {
    right: 11px;
  }
</style>
