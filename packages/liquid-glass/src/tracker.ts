import { GLASS_DEFAULTS, type GlassOptions, type Lens } from './types.js';

export interface GlassTrackerOptions {
  /** Called with the full, current list whenever any pane moves, resizes, fades, appears or goes. */
  onChange: (lenses: Lens[]) => void;
  /**
   * Subtree watched for DOM/class/style changes that may move panes
   * (default: document.body). Narrow it to your UI root if the page is busy.
   */
  root?: Node;
  /** Class added to tracked elements (default "lg-lens"); style it with glass.css. */
  className?: string;
}

interface Pane {
  options: Required<GlassOptions>;
  lens: Lens | null;
  key: string;
}

/**
 * Keeps glass panes aligned with DOM elements.
 *
 * Measuring every frame forever would waste battery, so the tracker measures
 * per frame only for a short window after anything that may move a pane: CSS
 * transitions/animations, class/style/DOM mutations under `root`, resizes,
 * element ResizeObserver hits and Svelte transition events. It only reports
 * when something actually changed. Opacity (including ancestors) becomes the
 * lens `strength`, so fades fade the refraction too. If you move panes from JS
 * in ways none of the above notice, call `kick()`.
 */
export class GlassTracker {
  private panes = new Map<HTMLElement, Pane>();
  private until = 0;
  private raf = 0;
  private dirty = false;
  private mo: MutationObserver | null = null;
  private readonly onDocEvent = () => this.kick();
  private readonly cls: string;

  constructor(private readonly opts: GlassTrackerOptions) {
    this.cls = opts.className ?? 'lg-lens';
  }

  /** Start tracking an element as a glass pane. Returns a function that stops tracking. */
  track(el: HTMLElement, options: GlassOptions = {}): () => void {
    this.watch();
    const pane: Pane = { options: { ...GLASS_DEFAULTS, ...options }, lens: null, key: '' };
    this.panes.set(el, pane);
    el.classList.add(this.cls);
    // Svelte transitions run on the Web Animations API (no CSS events) but dispatch these.
    const longKick = () => this.kick(1200);
    el.addEventListener('introstart', longKick);
    el.addEventListener('outrostart', longKick);
    const ro = new ResizeObserver(() => this.kick());
    ro.observe(el);
    this.kick();
    return () => {
      ro.disconnect();
      el.removeEventListener('introstart', longKick);
      el.removeEventListener('outrostart', longKick);
      el.classList.remove(this.cls);
      if (this.panes.delete(el)) {
        this.dirty = true;
        this.flush();
      }
    };
  }

  /** Change a tracked element's look. */
  update(el: HTMLElement, options: GlassOptions): void {
    const pane = this.panes.get(el);
    if (!pane) return;
    pane.options = { ...pane.options, ...options };
    pane.key = '';
    this.kick();
  }

  /** Re-measure every frame for `ms` milliseconds (use after moving panes from JS). */
  kick(ms = 700): void {
    this.until = Math.max(this.until, performance.now() + ms);
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  /** The current lenses (visible panes only). */
  get lenses(): Lens[] {
    const out: Lens[] = [];
    for (const p of this.panes.values()) if (p.lens) out.push(p.lens);
    return out;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.mo?.disconnect();
    this.mo = null;
    for (const ev of DOC_EVENTS) document.removeEventListener(ev, this.onDocEvent, true);
    window.removeEventListener('resize', this.onDocEvent);
    window.visualViewport?.removeEventListener('resize', this.onDocEvent);
    for (const el of this.panes.keys()) el.classList.remove(this.cls);
    this.panes.clear();
  }

  private tick = () => {
    this.raf = 0;
    for (const [el, pane] of this.panes) this.measure(el, pane);
    this.flush();
    if (performance.now() < this.until) this.raf = requestAnimationFrame(this.tick);
  };

  private flush() {
    if (!this.dirty) return;
    this.dirty = false;
    this.opts.onChange(this.lenses);
  }

  private measure(el: HTMLElement, pane: Pane) {
    const r = el.getBoundingClientRect();
    const strength = opacityOf(el);
    const onScreen = r.width > 2 && r.height > 2 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
    let lens: Lens | null = null;
    if (onScreen && strength > 0.02) {
      // A scale() transform shrinks the box but not the computed radius or the options.
      const k = el.offsetWidth ? r.width / el.offsetWidth : 1;
      const o = pane.options;
      lens = {
        x: r.left,
        y: r.top,
        width: r.width,
        height: r.height,
        radius: (parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0) * k,
        bezel: o.bezel * k,
        thickness: o.thickness * k,
        aberration: o.aberration,
        specular: o.specular,
        lightAngle: o.lightAngle,
        blur: o.blur * k,
        strength: Math.min(1, strength),
      };
    }
    const key = lens ? [lens.x, lens.y, lens.width, lens.height, lens.radius, lens.strength].map((v) => v.toFixed(2)).join() : '-';
    if (key === pane.key) return;
    pane.key = key;
    pane.lens = lens;
    this.dirty = true;
  }

  private watch() {
    if (this.mo) return;
    this.mo = new MutationObserver(() => this.kick());
    this.mo.observe(this.opts.root ?? document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    for (const ev of DOC_EVENTS) document.addEventListener(ev, this.onDocEvent, true);
    window.addEventListener('resize', this.onDocEvent);
    window.visualViewport?.addEventListener('resize', this.onDocEvent);
  }
}

const DOC_EVENTS = ['transitionrun', 'transitionend', 'animationstart', 'animationend'] as const;

/** Opacity including ancestors, so fades fade the refraction too. */
function opacityOf(el: HTMLElement): number {
  let a = 1;
  for (let n: HTMLElement | null = el; n && n !== document.body && a > 0.01; n = n.parentElement) {
    a *= Number(getComputedStyle(n).opacity);
  }
  return a;
}
