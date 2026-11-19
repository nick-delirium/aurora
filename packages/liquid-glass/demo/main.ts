/// <reference types="vite/client" />
import '../src/glass.css';
import { createGlassScene } from '../src/index.js';

// Any 2D canvas, image or video works as the background. Here: drifting blobs + stripes.
const art = document.createElement('canvas');
art.width = 1280;
art.height = 800;
const ctx = art.getContext('2d')!;
const blobs = [
  { c: '#ff5fa8', x: 0.25, y: 0.35, r: 0.32, s: 0.6 },
  { c: '#2f80e2', x: 0.7, y: 0.6, r: 0.38, s: 0.4 },
  { c: '#f99a12', x: 0.5, y: 0.2, r: 0.22, s: 0.8 },
];

function paint(t: number) {
  ctx.fillStyle = '#0b0b1a';
  ctx.fillRect(0, 0, art.width, art.height);
  for (const b of blobs) {
    const x = (b.x + Math.sin(t * 0.0003 * b.s) * 0.12) * art.width;
    const y = (b.y + Math.cos(t * 0.00025 * b.s) * 0.1) * art.height;
    const g = ctx.createRadialGradient(x, y, 0, x, y, b.r * art.width);
    g.addColorStop(0, b.c);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, art.width, art.height);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  for (let i = -art.height; i < art.width; i += 28) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + art.height, art.height);
    ctx.stroke();
  }
  requestAnimationFrame(paint);
}
requestAnimationFrame(paint);

const scene = createGlassScene({
  canvas: document.getElementById('bg') as HTMLCanvasElement,
  background: art,
  animate: true, // the canvas changes every frame
});

const card = document.getElementById('card')!;
scene.attach(card); // the tuned defaults
scene.attach(document.querySelector<HTMLElement>('.pill')!, { bezel: 18, thickness: 34, blur: 3 });

// Drag the card around; translate changes are picked up via style mutations.
let drag: { x: number; y: number } | null = null;
card.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX - card.offsetLeft, y: e.clientY - card.offsetTop };
  card.setPointerCapture(e.pointerId);
});
card.addEventListener('pointermove', (e) => {
  if (!drag) return;
  card.style.left = `${e.clientX - drag.x}px`;
  card.style.top = `${e.clientY - drag.y}px`;
});
card.addEventListener('pointerup', () => (drag = null));
