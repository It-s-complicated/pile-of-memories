import { defineConfig, lazyPlugins } from "vite-plus";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: ["src/routeTree.gen.ts"],
  },
  lint: {
    ignorePatterns: ["src/routeTree.gen.ts"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  plugins: lazyPlugins(() => [
    tanstackStart({
      srcDirectory: "src",
    }),
    react(),
  ]),
});
