cd ~/code/weekly-ai

cat > next.config.ts <<'TS'
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/', destination: '/reports', permanent: false },
    ];
  },
};

export default nextConfig;
TS

