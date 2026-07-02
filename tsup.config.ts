import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  bundle: true,
  clean: true,
  minify: false,
  sourcemap: false,
  // Prepend the shebang so the built file is directly executable.
  banner: { js: '#!/usr/bin/env node' },
  // npm sets the exec bit on bin files at install/link time, but make it
  // executable here too so `./dist/index.js` works straight from a build.
  onSuccess: 'chmod +x dist/index.js',
});
