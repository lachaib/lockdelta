import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'node20',
    dts: true,
    clean: true,
    sourcemap: true,
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    target: 'node20',
    dts: false,
    banner: { js: '#!/usr/bin/env node' },
    sourcemap: true,
  },
  {
    entry: { action: 'src/action.ts' },
    format: ['cjs'],
    target: 'node20',
    dts: false,
    sourcemap: true,
    noExternal: [/.*/],
    outExtension: () => ({ js: '.js' }),
  },
]);
