import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/": ["./db/custom.db", "./upload/**/*"],
    "/api/*": ["./db/custom.db", "./upload/**/*"],
    "/api/**/*": ["./db/custom.db", "./upload/**/*"],
  },
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
