import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Unit tests run in Node outside the RSC bundler. Production still enforces server-only.
  resolve: { alias: { 'server-only': fileURLToPath(new URL('./packages/integrations/test/server-only.stub.ts', import.meta.url)) } },
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/._*', '**/.next/**'],
    environment: 'node',
    testTimeout: 10_000,
  },
});
