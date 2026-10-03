// Keep Edge validation identical to packages/core without a second handwritten contract.
// Run: node supabase/functions/_shared/build-contracts.mjs
import { build } from 'esbuild';
await build({ entryPoints: ['packages/core/src/v1.ts'], bundle: true, format: 'esm', platform: 'neutral', external: ['zod'], outfile: 'supabase/functions/_shared/contracts.js', banner: { js: '/* eslint-disable */\n// Generated from packages/core/src/v1.ts. Do not edit; run build-contracts.mjs.' } });
