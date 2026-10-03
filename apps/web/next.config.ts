import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// Next has already loaded the app environment here. Its env loader caches that
// directory, so use Node's loader for the shared root file without overriding
// existing deployment variables or apps/web/.env.local values.
const rootEnvFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnvFile)) loadEnvFile(rootEnvFile);

const config: NextConfig = {
  // Keep agent instructions in the repository's root AGENTS.md and CLAUDE.md.
  agentRules: false,
  // Persistent native caches fail on this external-volume workspace. In-memory
  // caching remains available; these can be re-enabled on a compatible disk.
  experimental: {
    turbopackFileSystemCacheForDev: false,
    turbopackFileSystemCacheForBuild: false,
  },
  transpilePackages: ['@workspace/core'],
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
};
export default config;
