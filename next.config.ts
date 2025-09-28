cat > next.config.ts <<'EOF'
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/', destination: '/reports', permanent: false },
    ];
  },
};

export default nextConfig;
EOF

