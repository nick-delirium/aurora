import {
  TARGET_PRESETS,
  detectDevice,
  detectModelName,
  maxCanvasArea,
  type Size,
} from '../core/devices';
import { fitFrame, type Insets } from '../core/frame';
import { GENERATED_PREFIX, getPalette } from '../core/palettes';
import { DEFAULT_PARAMS, PARAM_SPEC, sanitizeParams, type Params } from '../core/params';
import { randomSeed } from '../core/rng';
import { decodeHash, encodeHash } from '../core/url';
import { MIME, exportImage } from '../engine/export';
import type { Renderer } from '../engine/renderer';
import { buildScene } from '../engine/scene';
import {
  SPEED_RANGE,
  type AppAPI,
  type AppState,
  type Format,
  type GlassSpec,
  type Quality,
  type QualityOption,
  type TargetGroup,
  type TargetInfo,
  type ViewState,
} from './api';
import { createStore } from './store';

const QUALITIES: Quality[] = ['native', '4k', 'max'];
const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function qualityOptions(target: Size): QualityOption[] {
  const { width: w, height: h } = target;
  const long = Math.max(w, h);
  const maxArea = maxCanvasArea() * 0.98;
  const fit = (scale: number): Size => {
    let s = scale;
    if (w * h * s * s > maxArea) s = Math.sqrt(maxArea / (w * h));
    return s === 1 ? { width: w, height: h } : { width: even(w * s), height: even(h * s) };
  };
  const opts: QualityOption[] = [{ id: 'native', label: 'Native', short: '1×', ...fit(1) }];
  if (long < 3840 * 0.97) opts.push({ id: '4k', label: '4K', short: '4K', ...fit(3840 / long) });
  const max = fit(2);
  if (max.width > opts[opts.length - 1].width * 1.08) opts.push({ id: 'max', label: 'Max', short: 'Max', ...max });
  return opts;
}

export function createApp(renderer: Renderer): AppAPI {
  const device = detectDevice();
  let deviceLabel = device.label;
  let insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const glassPanes = new Map<string, GlassSpec>();

  const resolveTarget = (s: Pick<AppState, 'targetId' | 'custom'>): TargetInfo => {
    if (s.targetId === 'custom') {
      return { id: 'custom', label: 'Custom size', kind: 'custom', isAuto: false, ...s.custom };
    }
    const preset = TARGET_PRESETS.find((p) => p.id === s.targetId);
    if (preset) return { id: preset.id, label: preset.label, kind: preset.kind, width: preset.width, height: preset.height, isAuto: false };
    return { id: 'auto', label: deviceLabel, kind: device.kind, width: device.width, height: device.height, isAuto: true };
  };

  const computeView = (s: Pick<AppState, 'targetId' | 'custom'>): ViewState => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const t = resolveTarget(s);
    const target = { width: t.width, height: t.height };
    const handheld = device.kind === 'phone' || device.kind === 'tablet';
    const { rect, mode } = fitFrame(viewport, insets, target, handheld && t.kind === device.kind);
    return { frame: rect, mode, viewport, target };
  };

  // Until the user picks a resolution, phones/tablets default to 4K, screens to native.
  let qualityChosen = QUALITIES.includes(decodeHash(location.hash).quality as Quality);
  const defaultQuality = (t: TargetInfo): Quality => (t.kind === 'phone' || t.kind === 'tablet' ? '4k' : 'native');

  const pickQuality = (wanted: Quality, target: Size): Quality => {
    const ids = qualityOptions(target).map((o) => o.id);
    if (ids.includes(wanted)) return wanted;
    return wanted === 'max' ? ids[ids.length - 1] : 'native';
  };

  // ── Initial state: URL hash wins, otherwise a fresh random wallpaper ──
  const fromUrl = decodeHash(location.hash);
  const validTarget = (id?: string) => !!id && (id === 'auto' || id === 'custom' || TARGET_PRESETS.some((p) => p.id === id));
  const base = {
    params: { ...DEFAULT_PARAMS, seed: randomSeed(), ...fromUrl.params } as Params,
    targetId: validTarget(fromUrl.targetId) ? fromUrl.targetId! : 'auto',
    custom: fromUrl.custom ?? { width: 3840, height: 2160 },
  };
  const preferred: Quality = QUALITIES.includes(fromUrl.quality as Quality)
    ? (fromUrl.quality as Quality)
    : defaultQuality(resolveTarget(base));
  const store = createStore<AppState>({
    ...base,
    quality: pickQuality(preferred, resolveTarget(base)),
    format: fromUrl.format === 'jpeg' ? 'jpeg' : 'png',
    deviceLabel,
    live: false,
    speed: SPEED_RANGE.default,
    view: computeView(base),
  });

  // ── Engine sync ──
  const pushScene = (s: AppState) => renderer.setScene(buildScene(s.params, getPalette(s.params.palette)));
  const pushView = (s: AppState) => renderer.setView(s.view.frame, s.view.target);
  pushScene(store.get());
  pushView(store.get());

  // ── Live mode: the renderer's clock runs ahead of params.time, which is
  // committed back to the store when pausing, exporting or sharing (and every
  // few seconds, so the URL roughly follows). ──
  let clock = store.get().params.time;
  renderer.setTime(clock);
  let liveRaf = 0;
  let lastTick = 0;
  let lastCommit = 0;

  const commitClock = () => {
    const p = store.get().params;
    if (Math.abs(p.time - clock) > 1e-3) store.set({ params: { ...p, time: clock } });
  };

  const tick = (now: number) => {
    liveRaf = requestAnimationFrame(tick);
    if (!lastTick) lastTick = now;
    const dt = (now - lastTick) / 1000;
    if (dt < 1 / 40) return; // ~30 fps is plenty for slow motion and saves battery
    lastTick = now;
    clock += Math.min(dt, 0.1) * store.get().speed;
    renderer.setTime(clock);
    if (now - lastCommit > 4000) {
      lastCommit = now;
      commitClock();
    }
  };

  const startLive = () => {
    if (liveRaf) return;
    lastTick = 0;
    lastCommit = performance.now();
    liveRaf = requestAnimationFrame(tick);
  };
  const stopLive = () => {
    cancelAnimationFrame(liveRaf);
    liveRaf = 0;
    commitClock();
  };

  // Don't burn battery in a background tab.
  document.addEventListener('visibilitychange', () => {
    if (!store.get().live) return;
    if (document.hidden) stopLive();
    else startLive();
  });

  let hashTimer = 0;
  const writeHash = () => history.replaceState(null, '', `#${encodeHash(store.get())}`);
  store.subscribe((s, prev) => {
    if (s.params !== prev.params) pushScene(s);
    if (s.params.time !== prev.params.time && Math.abs(s.params.time - clock) > 1e-3) {
      clock = s.params.time; // set from outside (URL, reset…)
      renderer.setTime(clock);
    }
    if (s.view !== prev.view) pushView(s);
    if (s.live !== prev.live) (s.live ? startLive : stopLive)();
    clearTimeout(hashTimer);
    hashTimer = window.setTimeout(writeHash, 300);
  });

  const refreshView = () => {
    renderer.resize();
    store.set({ view: computeView(store.get()) });
  };
  window.addEventListener('resize', refreshView);
  window.visualViewport?.addEventListener('resize', refreshView);
  window.addEventListener('orientationchange', () => setTimeout(refreshView, 250));

  // Someone pasted a share link into the address bar.
  window.addEventListener('hashchange', () => {
    const h = decodeHash(location.hash);
    const s = store.get();
    const next = {
      params: { ...s.params, ...h.params },
      targetId: validTarget(h.targetId) ? h.targetId! : s.targetId,
      custom: h.custom ?? s.custom,
    };
    store.set({ ...next, view: computeView(next) });
  });

  // Android/Chromium can tell us the actual model name.
  if (device.kind === 'phone' && /Android/i.test(navigator.userAgent)) {
    detectModelName().then((model) => {
      if (!model) return;
      deviceLabel = model;
      store.set({ deviceLabel: model });
    });
  }

  const setParams = (patch: Partial<Params>) => {
    const clean = sanitizeParams(patch);
    if (!Object.keys(clean).length) return;
    store.set({ params: { ...store.get().params, ...clean } });
  };

  const api: AppAPI = {
    getState: store.get,
    subscribe: store.subscribe,

    setParams,
    shuffle: () => setParams({ seed: randomSeed() }),
    randomPalette: () => setParams({ palette: `${GENERATED_PREFIX}${randomSeed()}` }),
    resetParams() {
      const { seed, palette } = store.get().params;
      store.set({ params: { ...DEFAULT_PARAMS, seed, palette, time: clock } });
    },

    setLive: (live) => store.set({ live }),
    setSpeed: (speed) =>
      store.set({ speed: clamp(speed, SPEED_RANGE.min, SPEED_RANGE.max) }),

    panBy(dx, dy) {
      const s = store.get();
      const t = s.view.target;
      const m = Math.min(t.width, t.height);
      const k = t.width / s.view.frame.width / m; // composition units per CSS px
      const px = dx * k;
      const py = -dy * k; // screen y grows down, composition y grows up
      const a = (s.params.angle * Math.PI) / 180;
      const qx = Math.cos(a) * px + Math.sin(a) * py;
      const qy = -Math.sin(a) * px + Math.cos(a) * py;
      const sx = PARAM_SPEC.posX;
      setParams({
        posX: clamp(s.params.posX + qx, sx.min, sx.max),
        posY: clamp(s.params.posY + qy / (t.height / m), 0, 1),
      });
    },

    setTarget(id) {
      const s = store.get();
      const next = { targetId: id, custom: s.custom };
      const t = resolveTarget(next);
      const quality = pickQuality(qualityChosen ? s.quality : defaultQuality(t), t);
      store.set({ targetId: id, quality, view: computeView(next) });
    },
    setCustomSize(size) {
      const s = store.get();
      const custom = { width: clamp(Math.round(size.width), 64, 16384), height: clamp(Math.round(size.height), 64, 16384) };
      const next = { targetId: s.targetId, custom };
      store.set({ custom, quality: pickQuality(s.quality, resolveTarget(next)), view: computeView(next) });
    },
    setQuality(quality) {
      qualityChosen = true;
      store.set({ quality });
    },
    setFormat: (format: Format) => store.set({ format }),

    getTarget: () => resolveTarget(store.get()),
    getTargetGroups(): TargetGroup[] {
      const groups: TargetGroup[] = [];
      for (const p of TARGET_PRESETS) {
        let g = groups.find((x) => x.group === p.group);
        if (!g) groups.push((g = { group: p.group, options: [] }));
        g.options.push({ id: p.id, label: p.label, width: p.width, height: p.height });
      }
      return groups;
    },
    getQualityOptions: () => qualityOptions(resolveTarget(store.get())),

    setViewInsets(next) {
      const same = (Object.keys(next) as (keyof Insets)[]).every((k) => Math.abs(next[k] - insets[k]) < 0.5);
      if (same) return;
      insets = next;
      store.set({ view: computeView(store.get()) });
    },

    async exportImage(onProgress) {
      commitClock();
      const s = store.get();
      const opts = qualityOptions(resolveTarget(s));
      const q = opts.find((o) => o.id === s.quality) ?? opts[0];
      const blob = await exportImage(renderer, q.width, q.height, s.format, onProgress);
      const pal = getPalette(s.params.palette);
      const name = pal.id.startsWith(GENERATED_PREFIX) ? 'custom' : pal.id;
      return {
        blob,
        url: URL.createObjectURL(blob),
        filename: `aurora-${name}-${s.params.seed}${s.params.time ? `-t${Math.round(s.params.time)}` : ''}-${q.width}x${q.height}.${s.format === 'jpeg' ? 'jpg' : 'png'}`,
        mime: MIME[s.format],
        width: q.width,
        height: q.height,
      };
    },

    getShareUrl() {
      commitClock();
      writeHash();
      return location.href;
    },

    setGlass(id, spec) {
      if (spec) glassPanes.set(id, spec);
      else if (!glassPanes.delete(id)) return;
      renderer.setLenses([...glassPanes.values()]);
    },
  };
  return api;
}
