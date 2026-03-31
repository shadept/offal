import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  // GitHub Pages serves from /<repo-name>/ — set base dynamically
  base: process.env.GITHUB_PAGES === 'true' ? '/offal/' : '/',
  plugins: [svelte()],
  server: {
    open: true,
  },
});
