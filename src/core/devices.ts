/**
 * Screen-size detection.
 *
 * Browsers don't expose the device model, but CSS screen size × devicePixelRatio
 * identifies iPhones/iPads exactly (Apple uses a small fixed set of sizes), and
 * gives the real render resolution on Android, Mac and PC. On Chromium/Android
 * we can additionally ask for the model name via User-Agent Client Hints.
 */

export type DeviceKind = 'phone' | 'tablet' | 'laptop' | 'desktop' | 'custom';

export interface Size {
  width: number;
  height: number;
}

export interface TargetPreset extends Size {
  id: string;
  label: string;
  group: string;
  kind: DeviceKind;
}

export interface DetectedDevice extends Size {
  label: string;
  kind: DeviceKind;
  /** 'exact' when matched against a known model table. */
  confidence: 'exact' | 'estimated';
}

// [label, css width, css height, dpr] — portrait, as reported by Safari.
const IPHONES: [string, number, number, number][] = [
  ['iPhone 16 Pro Max · 17 Pro Max', 440, 956, 3],
  ['iPhone Air', 420, 912, 3],
  ['iPhone 16 Pro · 17 · 17 Pro', 402, 874, 3],
  ['iPhone 15 Plus · 15 Pro Max · 16 Plus', 430, 932, 3],
  ['iPhone 15 · 15 Pro · 16', 393, 852, 3],
  ['iPhone 13 Pro Max · 14 Plus', 428, 926, 3],
  ['iPhone 12 · 13 · 14 · 16e', 390, 844, 3],
  ['iPhone XS Max · 11 Pro Max', 414, 896, 3],
  ['iPhone XR · 11', 414, 896, 2],
  ['iPhone X · XS · 11 Pro · mini', 375, 812, 3],
  ['iPhone 8 Plus', 414, 736, 3],
  ['iPhone SE · 8', 375, 667, 2],
];

// [label, css width, css height] — all @2x. iPad wallpapers are square so they survive rotation.
const IPADS: [string, number, number][] = [
  ['iPad Pro 13″', 1032, 1376],
  ['iPad Pro 12.9″ · Air 13″', 1024, 1366],
  ['iPad Pro 11″ (M4)', 834, 1210],
  ['iPad Pro 11″', 834, 1194],
  ['iPad Air 11″ · iPad', 820, 1180],
  ['iPad Air · Pro 10.5″', 834, 1112],
  ['iPad 10.2″', 810, 1080],
  ['iPad mini', 744, 1133],
  ['iPad 9.7″', 768, 1024],
];

// [label, width, height] in physical pixels.
const ANDROID: [string, number, number][] = [
  ['Pixel 9 · 10', 1080, 2424],
  ['Pixel 9 Pro · 10 Pro', 1280, 2856],
  ['Pixel Pro XL', 1344, 2992],
  ['Galaxy S24 · S25', 1080, 2340],
  ['Galaxy Ultra', 1440, 3120],
  ['FHD+ 20:9', 1080, 2400],
  ['QHD+ 20:9', 1440, 3200],
];

// Macs at their default "looks like" scaling (= the resolution macOS renders at).
const MACS: [string, number, number, DeviceKind][] = [
  ['MacBook Air 13″', 2940, 1912, 'laptop'],
  ['MacBook Air 13″ (native)', 2560, 1664, 'laptop'],
  ['MacBook Air 15″', 3420, 2214, 'laptop'],
  ['MacBook Air 15″ (native)', 2880, 1864, 'laptop'],
  ['MacBook Pro 14″', 3024, 1964, 'laptop'],
  ['MacBook Pro 16″', 3456, 2234, 'laptop'],
  ['MacBook 13″', 2880, 1800, 'laptop'],
  ['iMac 24″', 4480, 2520, 'desktop'],
  ['Studio Display · 5K', 5120, 2880, 'desktop'],
  ['Pro Display XDR', 6016, 3384, 'desktop'],
];

const DISPLAYS: [string, number, number][] = [
  ['Full HD', 1920, 1080],
  ['QHD 1440p', 2560, 1440],
  ['4K UHD', 3840, 2160],
  ['Ultrawide 1440p', 3440, 1440],
  ['Super ultrawide', 5120, 1440],
  ['5K', 5120, 2880],
  ['6K', 6016, 3384],
];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

function buildPresets(): TargetPreset[] {
  const out: TargetPreset[] = [];
  const seen = new Set<string>();
  const add = (p: TargetPreset) => {
    if (seen.has(p.id)) return;
    seen.add(p.id);
    out.push(p);
  };
  for (const [label, w, h, d] of IPHONES)
    add({ id: `iphone-${w * d}x${h * d}`, label, group: 'iPhone', kind: 'phone', width: w * d, height: h * d });
  for (const [label, w, h] of ANDROID)
    add({ id: `android-${w}x${h}`, label, group: 'Android', kind: 'phone', width: w, height: h });
  for (const [label, , h] of IPADS)
    add({ id: `ipad-${h * 2}`, label, group: 'iPad (square)', kind: 'tablet', width: h * 2, height: h * 2 });
  for (const [label, w, h, kind] of MACS)
    add({ id: `mac-${w}x${h}`, label, group: 'Mac', kind, width: w, height: h });
  for (const [label, w, h] of DISPLAYS)
    add({ id: `display-${slug(label)}`, label, group: 'Displays', kind: 'desktop', width: w, height: h });
  return out;
}

export const TARGET_PRESETS: TargetPreset[] = buildPresets();

interface UAData {
  mobile?: boolean;
  brands?: { brand: string }[];
  getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string }>;
}

const uaData = (): UAData | undefined => (navigator as Navigator & { userAgentData?: UAData }).userAgentData;

const near = (a: number, b: number, tol = 0.012) => Math.abs(a - b) / b < tol;

export function detectDevice(): DetectedDevice {
  const ua = navigator.userAgent;
  const dpr = window.devicePixelRatio || 1;
  const sw = window.screen.width;
  const sh = window.screen.height;
  const short = Math.min(sw, sh);
  const long = Math.max(sw, sh);

  const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isIPhone = /iPhone|iPod/.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isMobile = uaData()?.mobile ?? /Mobi/i.test(ua);

  if (isIPhone) {
    const m = IPHONES.find(([, w, h, d]) => w === short && h === long && d === Math.round(dpr));
    if (m) return { kind: 'phone', label: m[0], width: m[1] * m[3], height: m[2] * m[3], confidence: 'exact' };
    return { kind: 'phone', label: 'iPhone', width: Math.round(short * dpr), height: Math.round(long * dpr), confidence: 'estimated' };
  }

  if (isIPad) {
    const m = IPADS.find(([, w, h]) => w === short && h === long);
    const side = Math.round(long * dpr);
    return { kind: 'tablet', label: m?.[0] ?? 'iPad', width: side, height: side, confidence: m ? 'exact' : 'estimated' };
  }

  if (isAndroid) {
    const w = Math.round(short * dpr);
    const h = Math.round(long * dpr);
    if (!isMobile) return { kind: 'tablet', label: 'Android tablet', width: h, height: h, confidence: 'estimated' };
    const m = ANDROID.find(([, pw, ph]) => near(w, pw) && near(h, ph));
    return {
      kind: 'phone',
      label: 'Android phone',
      width: m ? m[1] : w,
      height: m ? m[2] : h,
      confidence: m ? 'exact' : 'estimated',
    };
  }

  // Desktop / laptop: screen × dpr is the resolution the OS renders at.
  const w = Math.round(sw * dpr);
  const h = Math.round(sh * dpr);
  const mac = MACS.find(([, mw, mh]) => mw === w && mh === h);
  if (mac) return { kind: mac[3], label: mac[0], width: w, height: h, confidence: 'exact' };
  const disp = DISPLAYS.find(([, dw, dh]) => dw === w && dh === h);
  const isMac = /Mac OS X|Macintosh/.test(ua);
  return {
    kind: 'desktop',
    label: disp ? `${disp[0]} display` : isMac ? 'Mac display' : 'This display',
    width: w,
    height: h,
    confidence: 'estimated',
  };
}

/** Model name via UA Client Hints (Chromium on Android, e.g. "Pixel 8"). */
export async function detectModelName(): Promise<string | null> {
  const data = uaData();
  if (!data?.getHighEntropyValues) return null;
  try {
    const v = await data.getHighEntropyValues(['model']);
    return v.model?.trim() || null;
  } catch {
    return null;
  }
}

/** Largest canvas area the current browser reliably allocates. */
export function maxCanvasArea(): number {
  const ua = navigator.userAgent;
  const webkitOnly = /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua);
  return webkitOnly || /iPhone|iPad/.test(ua) ? 16_777_216 : 50_000_000;
}
