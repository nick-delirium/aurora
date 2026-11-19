<!--
  iOS-26-style slider: white capsule knob that turns into a clear glass lens
  (magnifying the track under it) while you drag.
-->
<script lang="ts">
  import { overlayGlass } from '../glass';

  interface Props {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    format: (v: number) => string;
    defaultValue?: number;
    /** Label on the left, slider on the right (compact mobile layout). */
    inline?: boolean;
    onchange: (v: number) => void;
  }

  let { label, value, min, max, step, format, defaultValue, inline = false, onchange }: Props = $props();

  let rail: HTMLDivElement;
  let thumb: HTMLDivElement;
  let active = $state(false);

  const p = $derived((value - min) / (max - min));

  const decimals = $derived(Math.max(0, -Math.floor(Math.log10(step))));
  function quantize(v: number): number {
    const q = Math.round((v - min) / step) * step + min;
    return Math.min(max, Math.max(min, Number(q.toFixed(decimals + 1))));
  }

  function emit(v: number) {
    const q = quantize(v);
    if (q !== value) onchange(q);
  }

  function fromX(clientX: number): number {
    const r = rail.getBoundingClientRect();
    const tw = thumb.offsetWidth;
    const t = (clientX - r.left - tw / 2) / Math.max(1, r.width - tw);
    return min + Math.min(1, Math.max(0, t)) * (max - min);
  }

  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    rail.setPointerCapture(e.pointerId);
    active = true;
    emit(fromX(e.clientX));
  }

  function move(e: PointerEvent) {
    if (active && rail.hasPointerCapture(e.pointerId)) emit(fromX(e.clientX));
  }

  function up(e: PointerEvent) {
    if (rail.hasPointerCapture(e.pointerId)) rail.releasePointerCapture(e.pointerId);
    active = false;
  }

  function key(e: KeyboardEvent) {
    const big = (max - min) / 10;
    const delta: Record<string, number> = {
      ArrowRight: step,
      ArrowUp: step,
      ArrowLeft: -step,
      ArrowDown: -step,
      PageUp: big,
      PageDown: -big,
    };
    if (e.key in delta) emit(value + delta[e.key] * (e.shiftKey ? 10 : 1));
    else if (e.key === 'Home') emit(min);
    else if (e.key === 'End') emit(max);
    else return;
    e.preventDefault();
  }

  // The lens filter only exists while dragging.
  const lens = (el: HTMLElement) =>
    active
      ? overlayGlass(el, {
          bezel: 7,
          thickness: 9,
          magnify: 0.4,
          blur: 0,
          saturation: 1.3,
          aberration: 0.04,
          specular: 0.8,
        })
      : undefined;
</script>

<div class="ctl" class:inline>
  <div class="head">
    <span class="label">{label}</span>
    <output>{format(value)}</output>
  </div>
  <div
    bind:this={rail}
    class="slider"
    class:active
    style:--p={p}
    role="slider"
    tabindex="0"
    aria-label={label}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    aria-valuetext={format(value)}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onkeydown={key}
    ondblclick={() => defaultValue !== undefined && emit(defaultValue)}
  >
    <div class="track"><div class="fill"></div></div>
    <div bind:this={thumb} class="thumb" {@attach lens}></div>
  </div>
</div>

<style>
  .ctl {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 13.5px;
    color: var(--ui-text-2);
  }

  output {
    font-size: 12.5px;
    color: var(--ui-text-3);
    font-variant-numeric: tabular-nums;
  }

  .inline {
    flex-direction: row;
    align-items: center;
    gap: 12px;
  }

  .inline .slider {
    flex: 1;
  }

  .inline .head {
    width: 88px;
    flex: none;
    flex-direction: column;
    gap: 2px;
  }

  .inline .label {
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .inline output {
    font-size: 11.5px;
  }

  .slider {
    --tw: 38px;
    position: relative;
    flex: none;
    height: 30px;
    touch-action: pan-y;
    cursor: pointer;
    outline: none;
  }

  .track {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 6px;
    margin-top: -3px;
    border-radius: 99px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.18);
    box-shadow: inset 0 1px 1.5px rgba(0, 0, 0, 0.18);
  }

  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    width: calc(var(--p) * (100% - var(--tw)) + var(--tw) / 2);
    border-radius: inherit;
    background: rgba(255, 255, 255, 0.92);
  }

  .thumb {
    position: absolute;
    top: 50%;
    left: calc(var(--p) * (100% - var(--tw)));
    width: var(--tw);
    height: 24px;
    margin-top: -12px;
    border-radius: 99px;
    background: #fff;
    box-shadow:
      0 2px 7px rgba(0, 0, 0, 0.22),
      0 0 0 0.5px rgba(0, 0, 0, 0.06);
    transition:
      transform 0.45s var(--ease-spring),
      background-color 0.25s,
      box-shadow 0.25s;
  }

  .active .thumb {
    transform: scale(1.5);
    background: rgba(255, 255, 255, 0.06);
    box-shadow:
      inset 0 1px 1px rgba(255, 255, 255, 0.9),
      inset 0 -1px 1px rgba(255, 255, 255, 0.35),
      inset 0 0 0 0.5px rgba(255, 255, 255, 0.5),
      inset 0 0 8px rgba(255, 255, 255, 0.2),
      0 6px 18px rgba(0, 0, 0, 0.22);
  }

  /* Where the SVG lens isn't available (WebKit, Firefox), a CSS approximation. */
  .active .thumb:not(:global(.is-refractive)) {
    -webkit-backdrop-filter: saturate(1.6) brightness(1.12);
    backdrop-filter: saturate(1.6) brightness(1.12);
  }

  .slider:focus-visible .thumb {
    outline: 2px solid var(--ui-accent);
    outline-offset: 2px;
  }
</style>
