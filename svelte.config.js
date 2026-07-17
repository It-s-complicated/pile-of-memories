import adapter from "@sveltejs/adapter-auto";

/** @type {import("@sveltejs/kit").Config} */
export default {
  kit: {
    adapter: adapter(),
    experimental: {
      remoteFunctions: true,
    },
  },
  compilerOptions: {
    experimental: {
      async: true,
    },
  },
};
