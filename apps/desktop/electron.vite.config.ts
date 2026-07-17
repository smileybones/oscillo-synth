import { defineConfig } from 'electron-vite';

// electron-vite's empty per-target configs were not picking up Vite's usual
// production minify default (confirmed: `electron-vite build` produced
// fully unminified output in main/preload/renderer, ~1.8x larger than the
// equivalent plain-Vite apps/web build) — set explicitly rather than rely
// on an implicit default that isn't actually kicking in. This matters more
// than typical bundle-size hygiene here: the unminified synth-worklet code
// runs on the real-time audio thread, called on every ~128-sample render
// quantum, so the extra parse/execution overhead was a real contributor to
// reported sluggishness in synth mode, not just a slower page load.
const minify = { build: { minify: 'esbuild' as const } };

export default defineConfig({
  main: minify,
  preload: minify,
  renderer: minify,
});
