<script lang="ts">
  interface Option {
    id: string;
    label: string;
    sub?: string;
  }

  interface Props {
    label: string;
    options: Option[];
    value: string;
    compact?: boolean;
    onchange: (id: string) => void;
  }

  let { label, options, value, compact = false, onchange }: Props = $props();

  let root: HTMLDivElement;
  let x = $state(0);
  let w = $state(0);
  let animate = $state(false);
  let placedOnce = false;

  function place() {
    const b = root?.querySelector<HTMLElement>(`button[data-id="${CSS.escape(value)}"]`);
    if (!b || !b.offsetWidth) {
      w = 0;
      return;
    }
    x = b.offsetLeft;
    w = b.offsetWidth;
    // First placement jumps; later ones slide.
    if (placedOnce) animate = true;
    placedOnce = true;
  }

  $effect(() => {
    void value;
    void options;
    place();
  });

  $effect(() => {
    const ro = new ResizeObserver(place);
    ro.observe(root);
    return () => ro.disconnect();
  });

  // Radio-group keyboard pattern: one Tab stop, arrows move (and select).
  const focusIndex = $derived(Math.max(0, options.findIndex((o) => o.id === value)));
  function key(e: KeyboardEvent) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step || !options.length) return;
    e.preventDefault();
    const next = options[(focusIndex + step + options.length) % options.length];
    onchange(next.id);
    requestAnimationFrame(() => root.querySelector<HTMLElement>(`button[data-id="${CSS.escape(next.id)}"]`)?.focus());
  }
</script>

<div bind:this={root} class="seg" class:compact role="radiogroup" aria-label={label} tabindex="-1" onkeydown={key}>
  <span class="ind" class:animate style:width="{w}px" style:transform="translateX({x}px)" style:opacity={w ? 1 : 0}></span>
  {#each options as o, i (o.id)}
    <button
      type="button"
      role="radio"
      aria-checked={o.id === value}
      tabindex={i === focusIndex ? 0 : -1}
      data-id={o.id}
      onclick={() => o.id !== value && onchange(o.id)}
    >
      <span>{o.label}</span>
      {#if o.sub}<small>{o.sub}</small>{/if}
    </button>
  {/each}
</div>

<style>
  .seg {
    position: relative;
    display: flex;
    padding: 3px;
    border-radius: 99px;
    background: rgba(255, 255, 255, 0.1);
    box-shadow:
      inset 0 0.5px 0 rgba(255, 255, 255, 0.18),
      inset 0 1px 3px rgba(0, 0, 0, 0.12);
  }

  button {
    position: relative;
    z-index: 1;
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 7px 8px;
    border: 0;
    border-radius: 99px;
    background: none;
    cursor: pointer;
    color: var(--ui-text-2);
    font: 600 13px/1.1 var(--ui-font);
    transition: color 0.2s;
  }

  button[aria-checked='true'] {
    color: var(--ui-text);
  }

  button:focus-visible {
    outline: 2px solid var(--ui-accent);
    outline-offset: -2px;
  }

  small {
    font: 500 12px/1 var(--ui-font);
    color: var(--ui-text-3);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .compact button {
    flex: 0 0 auto;
    padding: 7px 11px;
    font-size: 12.5px;
  }

  .ind {
    position: absolute;
    top: 3px;
    bottom: 3px;
    left: 0;
    border-radius: 99px;
    background: rgba(255, 255, 255, 0.2);
    box-shadow:
      inset 0 1px 0.5px rgba(255, 255, 255, 0.55),
      inset 0 -0.5px 0.5px rgba(255, 255, 255, 0.2),
      0 2px 10px rgba(0, 0, 0, 0.18);
  }

  .ind.animate {
    transition:
      transform 0.5s var(--ease-spring),
      width 0.5s var(--ease-spring);
  }
</style>
