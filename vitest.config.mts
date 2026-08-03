import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    // integration tests that need a live DB opt-in via env; unit tests always run
  },
  resolve: {
    alias: { "@": import.meta.dirname },
  },
});
