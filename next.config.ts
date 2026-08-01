import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR?.trim() || '.next',
  serverExternalPackages: ['better-sqlite3', 'officeparser', '@mistralai/mistralai'],
  // Bundle the read-only demo snapshot into every serverless function so
  // lib/db.ts can seed /tmp/athena.db on Vercel cold starts.
  outputFileTracingIncludes: {
    '/**': ['./data/athena-seed.db'],
  },
};

export default nextConfig;
