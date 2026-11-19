<script lang="ts">
  let { checked, label, onchange }: { checked: boolean; label: string; onchange: (v: boolean) => void } = $props();
  let pressed = $state(false);
</script>

<button
  type="button"
  class="switch"
  class:pressed
  role="switch"
  aria-checked={checked}
  aria-label={label}
  onpointerdown={() => (pressed = true)}
  onpointerup={() => (pressed = false)}
  onpointerleave={() => (pressed = false)}
  onpointercancel={() => (pressed = false)}
  onclick={() => onchange(!checked)}
>
  <span class="knob"></span>
</button>

<style>
  .switch {
    position: relative;
    flex: none;
    width: 52px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 99px;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.2);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.15);
    transition: background-color 0.25s;
  }

  .switch[aria-checked='true'] {
    background: var(--ui-green);
  }

  .switch:focus-visible {
    outline: 2px solid var(--ui-accent);
    outline-offset: 2px;
  }

  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 28px;
    height: 28px;
    border-radius: 99px;
    background: #fff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
    transition:
      transform 0.45s var(--ease-spring),
      width 0.3s var(--ease-out),
      background-color 0.2s,
      box-shadow 0.2s;
  }

  .switch[aria-checked='true'] .knob {
    transform: translateX(20px);
  }

  /* Pressed: the knob stretches and turns into glass, like iOS 26. */
  .pressed .knob {
    width: 36px;
    transform: scale(1.15);
    background: rgba(255, 255, 255, 0.16);
    box-shadow:
      inset 0 1px 1px rgba(255, 255, 255, 0.9),
      inset 0 0 0 0.5px rgba(255, 255, 255, 0.5),
      0 4px 12px rgba(0, 0, 0, 0.25);
  }

  .pressed[aria-checked='true'] .knob {
    transform: translateX(12px) scale(1.15);
  }
</style>
