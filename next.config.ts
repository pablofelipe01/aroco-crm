import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray lockfile in the home dir was being
  // detected and confusing Turbopack's root inference.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
