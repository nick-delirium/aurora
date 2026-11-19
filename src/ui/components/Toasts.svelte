<script lang="ts">
  import { fly } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { glass } from '../glass';
  import { toasts } from '../toast.svelte';
</script>

<div class="toasts" aria-live="polite">
  {#each toasts as t (t.id)}
    <div
      class="toast glass"
      in:fly={{ y: -18, duration: 450, easing: backOut }}
      out:fly={{ y: -10, duration: 220 }}
      {@attach glass({ bezel: 16, thickness: 30, aberration: 0.05, specular: 0.35, blur: 3 })}
    >
      {t.message}
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: absolute;
    top: max(14px, env(safe-area-inset-top));
    left: 16px;
    right: 16px;
    z-index: 20;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    pointer-events: none;
  }

  .toast {
    --g-radius: 99px;
    max-width: 100%;
    padding: 11px 18px;
    font: 500 13.5px/1.25 var(--ui-font);
    text-align: center;
  }
</style>
