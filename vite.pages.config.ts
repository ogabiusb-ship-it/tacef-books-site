import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repositoryBasePath = "/tacef-books-site";

export default defineConfig({
  root: "github-pages",
  publicDir: "../public",
  base: `${repositoryBasePath}/`,
  define: {
    "process.env.NEXT_PUBLIC_BASE_PATH": JSON.stringify(repositoryBasePath),
  },
  plugins: [react()],
  build: {
    outDir: "../dist/pages",
    emptyOutDir: true,
  },
});
