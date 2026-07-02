// Vitest config kept separate from vite.config.ts: the TanStack Start plugin
// (SSR/router codegen) has no business running under the test runner. jsdom
// gives the sanitizers DOMParser; controller/scene tests are pure otherwise.
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
})
