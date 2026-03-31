import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves from /<repo-name>/ — set base dynamically
  base: process.env.GITHUB_PAGES === 'true' ? '/offal/' : '/',
  server: {
    open: true,
  },
});
