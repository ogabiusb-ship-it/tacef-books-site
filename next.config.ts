import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const repositoryBasePath = isGitHubPages ? "/tacef-books-site" : "";

const nextConfig: NextConfig = {
  ...(isGitHubPages ? { output: "export" as const } : {}),
  basePath: repositoryBasePath,
  assetPrefix: repositoryBasePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: repositoryBasePath,
  },
};

export default nextConfig;
