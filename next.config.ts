import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // postgres.js stays external on the server (runtime dep, not bundled)
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
