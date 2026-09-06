import { defineConfig } from "vitest/config";

// One config drives unit (core), component (agent) and integration (control-plane)
// suites. lcov is emitted for the SonarQube scan (§12.4). System-level cases are
// manual per the brief and are NOT run here.
export default defineConfig({
  test: {
    include: ["packages/*/tests/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["packages/web/**", "**/*.d.ts", "**/index.ts"],
    },
  },
});
