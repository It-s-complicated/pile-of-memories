import staticAdapter from "@sveltejs/adapter-static";
import adapter from "@sveltejs/adapter-netlify";
import { defineConfig, lazyPlugins } from "vite-plus";

const core = process.env.POM_PROFILE === "core";

export default defineConfig({
  // AT Protocol loopback clients register http://127.0.0.1 redirects (RFC 8252);
  // the default "localhost" binding only listens on ::1 on some machines.
  server: { host: "127.0.0.1" },
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
      adapter: core
        ? staticAdapter({ pages: "dist/core", assets: "dist/core", fallback: "index.html" })
        : adapter(),
      ...(core ? { files: { src: "src/core", appTemplate: "src/app.html" } } : {}),
      experimental: { remoteFunctions: !core },
      compilerOptions: { experimental: { async: true } },
    });
  }),
});
