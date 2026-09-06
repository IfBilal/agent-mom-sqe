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
        // The React harness is system-level (manual, per the brief §12.2) —
        // no unit tests, and it is out of the SonarQube coverage scope.
        "packages/web/**",
        "**/*.d.ts",
        "**/index.ts",
        // Type-only modules: `interface` / `type` declarations compile to an
        // empty .js, so there is nothing to execute or cover.
        "packages/core/src/types/**",
        "packages/agent/src/ipc.ts",
        "packages/agent/src/architecture/conversation-handler.ts",
        // Pure re-export so the unit test can reach the class in core.
        "packages/agent/src/sequence-checker.ts",
        // Thin forked-child bootstrap — all logic is in agent.ts, covered
        // directly by agent-orchestration.test.ts.
        "packages/agent/src/main.ts",
      ],
      // Enforced floor (actual: ~99.7% lines, 100% functions, ~92% branches).
      // 100% of pure logic. The residual line gap is `/* v8 ignore */`-boundary
      // artifacts; the branch gap is defensive `?.` / `??` guards and OS-error
      // arms (EACCES on broadcast, addMembership failure) that cannot be
      // induced deterministically — each marked with an inline reason.
      thresholds: { statements: 99, lines: 99, functions: 100, branches: 91 },
    },
  },
});
