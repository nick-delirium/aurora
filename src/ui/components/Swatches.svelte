<script lang="ts">
  import { GENERATED_PREFIX, PALETTES, getPalette } from '../../core/palettes';
  import { paletteGradient as gradient } from '../palette-css';
  import Icon from './Icon.svelte';

  interface Props {
    value: string;
    /** Single horizontally-scrolling row (mobile). */
    scroll?: boolean;
    onselect: (id: string) => void;
    onrandom: () => void;
  }

  let { value, scroll = false, onselect, onrandom }: Props = $props();

  let root: HTMLDivElement;

  const isGenerated = $derived(value.startsWith(GENERATED_PREFIX));

  // Keep the selected swatch visible in the scrolling row.
  $effect(() => {
    void value;
    if (!scroll) return;
    const el = root.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!el) return;
    const left = el.offsetLeft - root.clientWidth / 2 + el.offsetWidth / 2;
    root.scrollTo({ left, behavior: 'smooth' });
  });
</script>

<div bind:this={root} class="swatches" class:scroll role="radiogroup" aria-label="Palette">
  {#each PALETTES as p (p.id)}
    <button
      type="button"
      class="sw"
      role="radio"
      aria-checked={value === p.id}
      aria-label={p.name}
      title={p.name}
      style:--sw={gradient(p)}
      onclick={() => onselect(p.id)}
    ></button>
  {/each}
  <button
    type="button"
    class="sw dice"
    role="radio"
    aria-checked={isGenerated}
    aria-label="Random palette"
    title="Random palette"
    style:--sw={isGenerated ? gradient(getPalette(value)) : null}
    onclick={onrandom}
  >
    <Icon name="dice" />
  </button>
</div>

<style>
  .swatches {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    justify-items: center;
    gap: 10px 0;
  }

  .scroll {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    margin: 0 -14px;
    padding: 5px 14px;
    scrollbar-width: none;
  }

  .scroll::-webkit-scrollbar {
    display: none;
  }

  .sw {
    position: relative;
    flex: none;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    cursor: pointer;
    color: #fff;
    background: var(--sw, rgba(255, 255, 255, 0.12));
    box-shadow:
      inset 0 0 0 0.5px rgba(255, 255, 255, 0.4),
      inset 0 1px 1px rgba(255, 255, 255, 0.35),
      0 2px 6px rgba(0, 0, 0, 0.25);
    transition: transform 0.35s var(--ease-spring);
  }

  .sw::after {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    box-shadow: 0 0 0 2px transparent;
    transition: box-shadow 0.2s;
  }

  .sw[aria-checked='true']::after {
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.95);
  }

  .sw:active {
    transform: scale(0.88);
  }

  .sw:focus-visible {
    outline: 2px solid var(--ui-accent);
    outline-offset: 5px;
  }

  .dice :global(.icon) {
    width: 18px;
    height: 18px;
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.35));
  }
</style>
