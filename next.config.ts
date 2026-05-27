import type { NextConfig } from "next";

// GitHub Pages 静态导出: 站点 hosted at smokingmouse.github.io/bt-vis/
// 本地开发时不带 basePath, CI 构建时(NEXT_PUBLIC_BASE_PATH 由 workflow 设置)带上。
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
