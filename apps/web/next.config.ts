import type { NextConfig } from 'next';

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
