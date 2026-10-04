import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Prisma's engine and the Anthropic SDK stay on the server, outside the bundle.
  serverExternalPackages: ["@prisma/client", "bcryptjs", "sharp"],
  experimental: {
    // Question forms can carry several images (they're resized server-side to ~200 KB each).
    serverActions: { bodySizeLimit: "25mb" },
  },
  async headers() {
    return [
      {
        // The service worker must never be served stale, or updates won't roll out.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
export default withNextIntl(nextConfig);
