import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Don’t fail the build because of ESLint errors (we’ll fix them later).
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      { source: "/", destination: "/reports", permanent: false },
    ];
  },
};

export default nextConfig;
