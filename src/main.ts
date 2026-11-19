import './base.css';
import { createApp } from './app/controller';
import { Renderer } from './engine/renderer';
import { mountUI } from './ui';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;

try {
  const renderer = new Renderer(canvas);
  const app = createApp(renderer);
  mountUI(uiRoot, app);
} catch (err) {
  console.error(err);
  const msg = document.createElement('div');
  msg.className = 'fatal';
  msg.textContent = err instanceof Error ? err.message : 'Something went wrong while starting the generator.';
  document.body.append(msg);
}
