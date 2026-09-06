import { defineConfig } from "vitest/config";

// One config drives unit (core), component (agent) and integration (control-plane)
// suites. lcov is emitted for the SonarQube scan (§12.4). System-level cases are
// manual per the brief and are NOT run here.
export default defineConfig({
  test: {
    include: ["packages/*/tests/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 45000,
    pool: "forks",
    // Integration suites fork real agent processes on fixed demo ports (§7.1),
    // so test files must not run in parallel or the ports collide.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
      include: ["packages/*/src/**/*.ts"],
      exclude: [
        "packages/web/**",
        "**/*.d.ts",
        "**/index.ts",
        // Thin forked-child bootstrap — all logic is in agent.ts, which the
        // component suite covers directly (agent-orchestration.test.ts).
        "packages/agent/src/main.ts",
      ],
    },
  },
});
