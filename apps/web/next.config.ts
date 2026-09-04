import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  devIndicators: false,
  transpilePackages: ['@second-order/core', '@second-order/contracts', '@second-order/replays', '@second-order/ui'],
  experimental: { externalDir: true },
  env: {
    NEXT_PUBLIC_STREAM_URL: process.env.NEXT_PUBLIC_STREAM_URL ?? 'http://localhost:4010',
  },
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ] }];
  },
};

export default config;
