/**
 * The contract between the UI layer and the rest of the app.
 *
 * The UI imports ONLY this file (types) plus static data from src/core
 * (palettes, param specs). It never touches the renderer or WebGL, so the UI
 * can be rewritten (another framework, a different design) without touching
 * the generator.
 */
import type { DeviceKind, Size } from '../core/devices';
import type { FrameMode, Insets, Rect } from '../core/frame';
import type { Params } from '../core/params';
import type { Lens } from '@nick-delirium/liquid-glass';

/** A glass pane the engine refracts the wallpaper through (CSS px, viewport coords). */
export type GlassLens = Lens;

export type Quality = 'native' | '4k' | 'max';
export type Format = 'png' | 'jpeg';

export interface ViewState {
  /** Where the target wallpaper sits on screen, in CSS px. */
  frame: Rect;
  /** 'cover' = fills the screen; 'contain' = shown as a framed area. */
  mode: FrameMode;
  viewport: Size;
  /** Composition size (the target's native resolution). */
  target: Size;
}

export interface AppState {
  params: Params;
  /** 'auto' (detected device), a preset id, or 'custom'. */
  targetId: string;
  custom: Size;
  quality: Quality;
  format: Format;
  /** Label of the detected device (may be refined asynchronously). */
  deviceLabel: string;
  /** Live mode: the wallpaper slowly evolves (params.time advances). */
  live: boolean;
  /** Live playback speed multiplier. */
  speed: number;
  /** Undo/redo availability for the design (params). */
  canUndo: boolean;
  canRedo: boolean;
  view: ViewState;
}

export interface TargetInfo extends Size {
  id: string;
  label: string;
  kind: DeviceKind;
  isAuto: boolean;
}

export interface TargetGroup {
  group: string;
  options: { id: string; label: string; width: number; height: number }[];
}

export interface QualityOption extends Size {
  id: Quality;
  label: string;
  short: string;
}

export interface ExportResult {
  blob: Blob;
  /** Object URL for the blob; revoke when done. */
  url: string;
  filename: string;
  mime: string;
  width: number;
  height: number;
}

export interface AppAPI {
  getState(): AppState;
  subscribe(fn: (state: AppState, prev: AppState) => void): () => void;

  setParams(patch: Partial<Params>): void;
  shuffle(): void;
  randomPalette(): void;
  /** Reset adjustments to defaults, keeping seed + palette. */
  resetParams(): void;
  /** Step back / forward through design changes. Returns false when there is nothing to do. */
  undo(): boolean;
  redo(): boolean;
  /** Move the pattern by a screen-space drag delta (CSS px). */
  panBy(dx: number, dy: number): void;

  setLive(on: boolean): void;
  setSpeed(speed: number): void;

  setTarget(id: string): void;
  setCustomSize(size: Size): void;
  setQuality(q: Quality): void;
  setFormat(f: Format): void;

  getTarget(): TargetInfo;
  getTargetGroups(): TargetGroup[];
  getQualityOptions(): QualityOption[];

  /** UI reports the screen area its chrome covers, so framed previews avoid it. */
  setViewInsets(insets: Insets): void;

  /** Exports the current moment (in live mode: the frame on screen when called). */
  exportImage(onProgress?: (p: number) => void): Promise<ExportResult>;
  getShareUrl(): string;

  /**
   * The glass panes currently on screen; the engine refracts the wallpaper
   * through them. Preview only — never part of exports.
   */
  setGlass(lenses: GlassLens[]): void;
}

export const SPEED_RANGE = { min: 0.2, max: 4, step: 0.05, default: 1 } as const;
