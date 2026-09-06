import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

// Meta-tests that keep the traceability matrix (§15) honest:
//  1. every non-system COND-nn is referenced by at least one test file, so
//     Table C has no orphans;
//  2. COND-52 — a genuine static inspection: no ack/retry/resend symbol exists
//     on any multicast or broadcast transport path (BR-23).

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..");

function walk(dir: string, pred: (p: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      out.push(...walk(p, pred));
    } else if (pred(p)) {
      out.push(p);
    }
  }
  return out;
}

describe("Traceability — every non-system test condition is carried by a test (§15, no orphans)", () => {
  const conditionsMd = readFileSync(join(REPO, "TEST-CONDITIONS.md"), "utf8");
  const rows = [...conditionsMd.matchAll(/^\|\s*(COND-\d+)\s*\|.*?\|\s*([UCIS])\s*\|/gm)].map(
    ([, id, level]) => ({ id: id!, level: level! }),
  );
  const automated = rows.filter((r) => r.level !== "S").map((r) => r.id);
  const systemLevel = rows.filter((r) => r.level === "S").map((r) => r.id);

  const testFiles = walk(join(REPO, "packages"), (p) => p.endsWith(".test.ts"));
  const allTestText = testFiles.map((f) => readFileSync(f, "utf8")).join("\n");

  it("parsed all 54 conditions from TEST-CONDITIONS.md", () => {
    expect(rows).toHaveLength(54);
  });

  it("every U/C/I condition appears in a test file", () => {
    const orphans = automated.filter((id) => !allTestText.includes(id));
    expect(orphans, `orphan conditions with no test: ${orphans.join(", ")}`).toEqual([]);
  });

  it("system-level conditions are documented as manual, not silently missing", () => {
    // COND-10, 17, 27, 33, 49, 30, 51 — executed by a person through the harness
    // (plan §12.2). They are NOT expected in the automated suite.
    expect(systemLevel.length).toBeGreaterThanOrEqual(5);
  });
});

describe("COND-52 — static inspection: no ack / retry / resend / retransmit path on any transport (BR-23)", () => {
  const transportSrc = walk(join(REPO, "packages", "agent", "src", "transports"), (p) => p.endsWith(".ts"));

  it("multicast and broadcast transports contain no retry vocabulary in executable code", () => {
    const forbidden = /\b(retry|resend|retransmit|acknowledge|ackTimeout|maxRetries|backoff)\b/;
    for (const file of transportSrc) {
      const src = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
        .join("\n");
      expect(forbidden.test(src), `${file} contains retry vocabulary`).toBe(false);
    }
  });
});
