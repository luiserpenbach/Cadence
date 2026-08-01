import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    serverActions: {
      // file attachments upload through a server action
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
