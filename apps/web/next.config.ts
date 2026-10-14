import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app lives inside an npm-workspaces monorepo; tell the bundler where the repo root is.
  turbopack: { root: path.join(import.meta.dirname, "../..") },
  poweredByHeader: false,
};

export default nextConfig;
