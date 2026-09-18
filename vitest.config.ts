import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    reporters: ["default"],
    // Determinism guard: tests must not depend on wall-clock or randomness.
    // All domain clocks and id generators are injected by the test builders.
    sequence: { concurrent: false },
  },
});
