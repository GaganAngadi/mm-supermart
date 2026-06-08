import path from "node:path";

/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  typedRoutes: true,
  experimental: {
    devtoolSegmentExplorer: false
  }
};

export default nextConfig;
