<!--
  Touch-device save sheet. Device, size and format live here (mobile keeps the
  panel lean); the image starts rendering as soon as the sheet opens and again
  after any change, so "Save to Photos" is ready in the same sheet. Sharing
  needs its own tap (browsers require a fresh user gesture for the share sheet).
  Desktop with a touch screen opens it with a finished render (`initial`).
-->
<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import type { AppAPI, AppState, ExportResult, Format } from '../../app/api';
  import { glass } from '../glass';
  import Icon from './Icon.svelte';
  import OutputOptions from './OutputOptions.svelte';
  import Segmented from './Segmented.svelte';

  interface Props {
    app: AppAPI;
    s: AppState;
    /** A finished render to show right away (skips the first render). */
    initial?: ExportResult | null;
    onclose: () => void;
  }

  let { app, s, initial = null, onclose }: Props = $props();

  // svelte-ignore state_referenced_locally
  let result: ExportResult | null = $state(initial);
  let rendering = $state(false);
  let progress = $state(0);
  let error = $state('');
  let shared = $state(false);
  let dialog: HTMLDivElement;

  const quality = $derived.by(() => (void s.targetId, void s.custom, void s.quality, app.getQualityOptions()));
  const selected = $derived(quality.find((q) => q.id === s.quality) ?? quality[0]);

  const file = $derived(result ? new File([result.blob], result.filename, { type: result.mime }) : null);
  const canShare = $derived(!!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }));
  const ua = navigator.userAgent;
  const isApple = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const setItHint = isApple
    ? 'Then in Photos: Share → Use as Wallpaper.'
    : /Android/.test(ua)
      ? 'Then in your gallery: Set as wallpaper.'
      : 'Then set it from your system’s wallpaper settings.';

  // ── Render on open and after option changes (one at a time, latest wins) ──
  let wanted = '';
  let inFlight = false;
  const optionsKey = $derived(`${s.targetId}|${s.custom.width}x${s.custom.height}|${s.quality}|${s.format}`);

  async function renderLatest() {
    if (inFlight) return;
    inFlight = true;
    rendering = true;
    error = '';
    try {
      while (true) {
        const key = wanted;
        progress = 0;
        const next = await app.exportImage((p) => (progress = p));
        if (key !== wanted) {
          URL.revokeObjectURL(next.url); // options changed meanwhile: render again
          continue;
        }
        if (result) URL.revokeObjectURL(result.url);
        result = next;
        shared = false;
        break;
      }
    } catch (err) {
      error = `Couldn't render this size (${err instanceof Error ? err.message : 'unknown error'}). Pick a smaller one.`;
    } finally {
      inFlight = false;
      rendering = false;
    }
  }

  let first = true;
  $effect(() => {
    const key = optionsKey;
    if (first && initial) {
      first = false;
      wanted = key;
      return;
    }
    first = false;
    const t = setTimeout(() => {
      wanted = key;
      renderLatest();
    }, 200);
    return () => clearTimeout(t);
  });

  async function share() {
    if (!file) return;
    try {
      await navigator.share({ files: [file] });
      shared = true;
    } catch (e) {
      if ((e as Error).name !== 'AbortError') error = 'Could not open the share sheet — use Download instead.';
    }
  }

  function close() {
    if (result) {
      const url = result.url;
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    onclose();
  }

  // Focus moves into the sheet and returns to whatever opened it.
  $effect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) requestAnimationFrame(() => opener.focus({ preventScroll: true }));
    };
  });
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<div class="wrap" role="presentation" transition:fade={{ duration: 200 }} onclick={(e) => e.target === e.currentTarget && close()}>
  <div
    bind:this={dialog}
    class="sheet lg-glass"
    role="dialog"
    aria-modal="true"
    aria-labelledby="save-title"
    tabindex="-1"
    transition:fly={{ y: 40, duration: 450, easing: backOut }}
    {@attach glass({ bezel: 36, thickness: 72, aberration: 0.04, specular: 0.3, blur: 4 })}
  >
    <header>
      <h2 id="save-title">Save wallpaper</h2>
      <button class="btn btn-icon btn-ghost" aria-label="Close" onclick={close}><Icon name="close" /></button>
    </header>

    <div class="body">
      <div class="preview" class:busy={rendering}>
        {#if result}
          <img src={result.url} alt="Your wallpaper, {result.width} by {result.height}" />
        {/if}
        {#if rendering}
          <div class="progress" aria-live="polite">
            <Icon name="spinner" class="spin" />
            Rendering {selected.width} × {selected.height} · {Math.round(progress * 100)}%
          </div>
        {/if}
      </div>

      <OutputOptions {app} {s} />
      <div class="row">
        <span class="label">Format</span>
        <Segmented
          label="File format"
          options={[
            { id: 'png', label: 'PNG' },
            { id: 'jpeg', label: 'JPEG' },
          ]}
          value={s.format}
          onchange={(id) => app.setFormat(id as Format)}
        />
      </div>

      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}

      {#if canShare}
        <p class="hint">
          {shared ? setItHint : isApple ? 'Tap Save to Photos, then “Save Image”.' : 'Tap Share / Save, then pick where it goes.'}
        </p>
        <button class="btn btn-primary wide" disabled={rendering || !result} onclick={share}>
          <Icon name="share" />{isApple ? 'Save to Photos' : 'Share / Save'}
        </button>
        {#if result}
          <a class="btn secondary" href={result.url} download={result.filename}><Icon name="download" />Download file</a>
        {/if}
      {:else if result}
        <a class="btn btn-primary wide" href={result.url} download={result.filename} class:disabled={rendering}>
          <Icon name="download" />Download {result.width} × {result.height}
        </a>
        <p class="hint">{setItHint}</p>
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
    background: rgba(0, 0, 0, 0.25);
  }

  .sheet {
    --lg-radius: 32px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: min(440px, 100%);
    max-height: calc(100dvh - 32px);
    padding: 8px 0 16px;
    outline: none;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px 0 20px;
  }

  h2 {
    margin: 0;
    font: 700 17px/1 var(--ui-font);
  }

  /* The glass element itself must not scroll: its refraction would scroll away with the content. */
  .body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
    padding: 2px 16px 0;
  }

  .preview {
    position: relative;
    display: grid;
    place-items: center;
    height: min(30dvh, 260px);
    border-radius: 18px;
    background: rgba(0, 0, 0, 0.22);
    overflow: hidden;
  }

  .preview img {
    position: absolute;
    inset: 8px;
    width: calc(100% - 16px);
    height: calc(100% - 16px);
    object-fit: contain;
    filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.45));
    transition: opacity 0.25s;
  }

  .preview.busy img {
    opacity: 0.35;
  }

  .progress {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 8px;
    font: 600 13.5px/1.2 var(--ui-font);
    font-variant-numeric: tabular-nums;
  }

  .label {
    font-size: 13.5px;
    color: var(--ui-text-2);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .hint {
    margin: 4px 0 -4px;
    text-align: center;
    font-size: 13px;
    color: var(--ui-text-2);
  }

  .error {
    margin: 0;
    padding: 10px 12px;
    border-radius: 12px;
    font-size: 13px;
    background: rgba(255, 69, 58, 0.22);
  }

  .wide {
    width: 100%;
    height: 52px;
    font-size: 16px;
    font-variant-numeric: tabular-nums;
  }

  .wide.disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  .secondary {
    width: 100%;
  }
</style>
