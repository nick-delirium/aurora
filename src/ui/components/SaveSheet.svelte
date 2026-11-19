<!--
  Touch-device save flow.
    1. options — device, resolution, format → "Save image" (renders)
    2. result  — preview + Save to Photos (share sheet) / Download
  Sharing needs a fresh tap (browsers require a user gesture), which is why the
  render happens first and the share is a separate button.
  Desktop with a touch screen skips step 1 (it renders from the panel).
-->
<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import type { AppAPI, AppState, ExportResult, Format } from '../../app/api';
  import { glass } from '../glass';
  import { toast } from '../toast.svelte';
  import Icon from './Icon.svelte';
  import OutputOptions from './OutputOptions.svelte';
  import Segmented from './Segmented.svelte';

  interface Props {
    app: AppAPI;
    s: AppState;
    /** Start directly at the result step. */
    initial?: ExportResult | null;
    onclose: () => void;
  }

  let { app, s, initial = null, onclose }: Props = $props();

  // svelte-ignore state_referenced_locally
  let result: ExportResult | null = $state(initial);
  let busy = $state(false);
  let progress = $state(0);

  const quality = $derived.by(() => (void s.targetId, void s.custom, void s.quality, app.getQualityOptions()));
  const selected = $derived(quality.find((q) => q.id === s.quality) ?? quality[0]);

  const file = $derived(result ? new File([result.blob], result.filename, { type: result.mime }) : null);
  const canShare = $derived(!!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }));
  const isApple =
    /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

  async function render() {
    if (busy) return;
    busy = true;
    progress = 0;
    try {
      result = await app.exportImage((p) => (progress = p));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Export failed');
    } finally {
      busy = false;
    }
  }

  async function share() {
    if (!file) return;
    try {
      await navigator.share({ files: [file] });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast('Could not open the share sheet');
    }
  }

  function close() {
    if (result) setTimeout(() => URL.revokeObjectURL(result!.url), 1000);
    onclose();
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<div class="wrap" role="presentation" transition:fade={{ duration: 200 }} onclick={(e) => e.target === e.currentTarget && close()}>
  <div
    class="sheet glass"
    role="dialog"
    aria-modal="true"
    aria-label={result ? 'Wallpaper ready' : 'Save wallpaper'}
    transition:fly={{ y: 40, duration: 450, easing: backOut }}
    {@attach glass({ bezel: 36, thickness: 72, aberration: 0.04, specular: 0.3, blur: 4 })}
  >
    <header>
      <h2>{result ? 'Wallpaper ready' : 'Save wallpaper'}</h2>
      <button class="btn btn-icon btn-sm btn-ghost" aria-label="Close" onclick={close}><Icon name="close" /></button>
    </header>

    <!-- The glass element itself must not scroll: its refraction layer would scroll away with the content. -->
    <div class="body">
    {#if !result}
      <OutputOptions {app} {s} />
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
      <button class="btn btn-primary wide" disabled={busy} onclick={render}>
        {#if busy}
          <Icon name="spinner" class="spin" />Rendering {Math.round(progress * 100)}%
        {:else}
          <Icon name="download" />Save {selected.width} × {selected.height}
        {/if}
      </button>
    {:else}
      <img src={result.url} alt="Your generated wallpaper" />
      <div class="meta">
        {result.width} × {result.height} · {result.mime === 'image/png' ? 'PNG' : 'JPEG'} · {(result.blob.size / 1048576).toFixed(1)} MB
      </div>
      {#if canShare}
        <button class="btn btn-primary wide" onclick={share}>
          <Icon name="share" />{isApple ? 'Save to Photos' : 'Share / Save'}
        </button>
      {/if}
      <div class="row">
        <a class="btn" href={result.url} download={result.filename}><Icon name="download" />Download</a>
        <button class="btn" onclick={close}>Done</button>
      </div>
      {#if canShare && isApple}
        <p class="hint">Then tap “Save Image” in the share sheet.</p>
      {/if}
    {/if}
    </div>
  </div>
</div>

<style>
  .wrap {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 16px 12px max(12px, env(safe-area-inset-bottom));
    pointer-events: auto;
  }

  .sheet {
    --g-radius: 32px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: min(440px, 100%);
    max-height: calc(100dvh - 32px);
    padding: 10px 0 16px;
  }

  header {
    padding: 0 16px;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
    padding: 4px 16px 0;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  h2 {
    margin: 0 0 0 4px;
    font: 700 17px/1 var(--ui-font);
  }

  .label {
    font-size: 13.5px;
    color: var(--ui-text-2);
  }

  img {
    display: block;
    width: 100%;
    max-height: 40dvh;
    object-fit: contain;
    border-radius: 20px;
    background: rgba(0, 0, 0, 0.2);
  }

  .meta {
    text-align: center;
    font-size: 12.5px;
    color: var(--ui-text-3);
    font-variant-numeric: tabular-nums;
  }

  .wide {
    width: 100%;
    height: 50px;
    font-size: 16px;
    font-variant-numeric: tabular-nums;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .row .btn {
    flex: 1;
  }

  .hint {
    margin: 0;
    text-align: center;
    font-size: 12px;
    color: var(--ui-text-3);
  }
</style>
