import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    serverActions: {
      // file attachments upload through a server action
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
