import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@temporalio/client",
    "@temporalio/worker",
    "@temporalio/workflow",
    "@temporalio/activity",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
