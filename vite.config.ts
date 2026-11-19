import basicSsl from '@vitejs/plugin-basic-ssl';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// `npm run dev:phone` serves over HTTPS on your LAN. Phones need a secure
// context for the share sheet ("Save to Photos") and the clipboard.
const https = process.env.HTTPS === '1';

const glassSrc = (file: string) => fileURLToPath(new URL(`./packages/liquid-glass/src/${file}`, import.meta.url));

export default defineConfig({
  // Relative asset paths: the build works at any sub-path (GitHub Pages
  // project sites like /aurora/) or at a domain root.
  base: './',
  resolve: {
    // Aurora consumes the glass package from source (no build step in dev).
    alias: [
      { find: /^@nick-delirium\/liquid-glass\/glass\.css$/, replacement: glassSrc('glass.css') },
      { find: /^@nick-delirium\/liquid-glass$/, replacement: glassSrc('index.ts') },
    ],
  },
  plugins: [svelte(), ...(https ? [basicSsl()] : [])],
});
