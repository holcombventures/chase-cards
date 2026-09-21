import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.pokemontcg.io",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.scrydex.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "assets.tcgdex.net",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "optcg-api.arjunbansal-ai.workers.dev",
        pathname: "/images/**",
      },
      {
        protocol: "https",
        hostname: "optcgapi.com",
        pathname: "/media/**",
      },
    ],
  },
};

export default nextConfig;
