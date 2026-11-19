import basicSsl from '@vitejs/plugin-basic-ssl';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// `npm run dev:phone` serves over HTTPS on your LAN. Phones need a secure
// context for the share sheet ("Save to Photos") and the clipboard.
const https = process.env.HTTPS === '1';

export default defineConfig({
  // Relative asset paths: the build works at any sub-path (GitHub Pages
  // project sites like /aurora/) or at a domain root.
  base: './',
  plugins: [svelte(), ...(https ? [basicSsl()] : [])],
});
