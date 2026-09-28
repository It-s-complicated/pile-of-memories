import adapter from "@sveltejs/adapter-netlify";
import { defineConfig, lazyPlugins } from "vite-plus";

export default defineConfig({
  test: {
    // Vitest v4 compatibility: preserve mock call history.
    // Remove after tests no longer rely on calls from setup or earlier tests.
    // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
    clearMocks: false,
  },
  staged: {
    "*": "vp check --fix",
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  plugins: lazyPlugins(async () => {
    const { sveltekit } = await import("@sveltejs/kit/vite");
    return sveltekit({
      adapter: adapter(),
      experimental: { remoteFunctions: true },
      compilerOptions: { experimental: { async: true } },
    });
  }),
});
