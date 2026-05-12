/** @type {import('next').NextConfig} */
const ragBase = (process.env.RAG_SERVICE_URL || process.env.NEXT_PUBLIC_RAG_SERVICE_URL || "").replace(/\/$/, "");

const nextConfig = {
  reactStrictMode: true,
  // Pure ESM + Three loaders — Next needs to transpile @pixiv/three-vrm for the client bundle
  transpilePackages: ["@pixiv/three-vrm"],
  images: {
    domains: ["localhost"]
  },
  async rewrites() {
    if (!ragBase) return [];
    return [{ source: "/graphrag-static/:path*", destination: `${ragBase}/static/:path*` }];
  }
};

export default nextConfig;
