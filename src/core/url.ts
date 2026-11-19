import { DEFAULT_PARAMS, sanitizeParams, type Params } from './params';

/** Short keys keep share links readable. */
const KEYS: Record<keyof Params, string> = {
  seed: 's',
  palette: 'p',
  posX: 'x',
  posY: 'y',
  intensity: 'i',
  grain: 'g',
  amplitude: 'a',
  frequency: 'f',
  width: 'w',
  reachUp: 'ru',
  reachDown: 'rd',
  edgeDark: 'ed',
  expand: 'ex',
  angle: 'an',
  warp: 'wp',
  variation: 'v',
  vignette: 'vg',
  grainAmount: 'ga',
  grainSize: 'gs',
  time: 'tm',
};

export interface HashState {
  params: Partial<Params>;
  targetId?: string;
  quality?: string;
  format?: string;
  custom?: { width: number; height: number };
}

const round = (v: number) => Math.round(v * 1000) / 1000;
const roundTime = (v: number) => Math.round(v * 100) / 100;

export function encodeHash(s: {
  params: Params;
  targetId: string;
  quality: string;
  format: string;
  custom: { width: number; height: number };
}): string {
  const q = new URLSearchParams();
  for (const key of Object.keys(KEYS) as (keyof Params)[]) {
    const v = s.params[key];
    const always = key === 'seed' || key === 'palette';
    if (!always && v === DEFAULT_PARAMS[key]) continue;
    const num = (n: number) => String(key === 'time' ? roundTime(n) : round(n));
    q.set(KEYS[key], typeof v === 'boolean' ? (v ? '1' : '0') : typeof v === 'number' ? num(v) : v);
  }
  if (s.targetId !== 'auto') q.set('t', s.targetId);
  if (s.targetId === 'custom') q.set('cs', `${s.custom.width}x${s.custom.height}`);
  q.set('q', s.quality);
  if (s.format !== 'png') q.set('fmt', s.format);
  return q.toString();
}

export function decodeHash(hash: string): HashState {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const raw: Record<string, unknown> = {};
  for (const [key, short] of Object.entries(KEYS) as [keyof Params, string][]) {
    const v = q.get(short);
    if (v == null) continue;
    if (key === 'palette') raw.palette = v;
    else if (key === 'grain' || key === 'expand') raw[key] = v === '1';
    else raw[key] = Number(v);
  }
  const out: HashState = { params: sanitizeParams(raw as Partial<Params>) };
  const t = q.get('t');
  if (t) out.targetId = t;
  const cs = q.get('cs')?.match(/^(\d+)x(\d+)$/);
  if (cs) out.custom = { width: Number(cs[1]), height: Number(cs[2]) };
  const quality = q.get('q');
  if (quality) out.quality = quality;
  const fmt = q.get('fmt');
  if (fmt) out.format = fmt;
  return out;
}
