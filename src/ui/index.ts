/**
 * UI layer entry point. Everything under src/ui is Svelte and talks to the rest
 * of the app only through AppAPI (src/app/api.ts) — swap or redesign freely.
 */
import { mount } from 'svelte';
import type { AppAPI } from '../app/api';
import App from './App.svelte';
import { setGlassHost } from './glass';
import './ui.css';

export function mountUI(root: HTMLElement, app: AppAPI): void {
  setGlassHost(app);
  mount(App, { target: root, props: { app } });
}
