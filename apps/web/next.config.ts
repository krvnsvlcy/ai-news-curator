import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["mongodb"],
  async redirects() {
    return [
      { source: "/sources/:path*", destination: "/settings/sources/:path*", permanent: true },
      { source: "/analytics", destination: "/", permanent: true },
      { source: "/analytics/:id", destination: "/letters/:id/analytics", permanent: true },
    ];
  },
};

export default config;
