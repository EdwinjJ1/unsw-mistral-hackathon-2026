import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR?.trim() || '.next',
  serverExternalPackages: ['better-sqlite3', 'officeparser', '@mistralai/mistralai'],
};

export default nextConfig;
