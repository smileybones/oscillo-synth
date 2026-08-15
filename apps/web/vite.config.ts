import { defineConfig } from 'vite';

// GitHub Pages serves a project site from a /<repo-name>/ subpath, not the
// domain root — set only for that build (see .github/workflows/deploy-pages
// .yml), so local dev and any other deployment target keep the default '/'.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/oscillo-synth/' : '/',
});
