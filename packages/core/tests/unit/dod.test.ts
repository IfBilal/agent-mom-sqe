import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Definition-of-Done gate (plan §20). These assertions make the DoD criteria
// machine-checkable so they cannot silently regress between now and the freeze.

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..");

function walk(dir: string, pred: (p: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", "coverage", ".git"].includes(entry.name)) continue;
      out.push(...walk(p, pred));
    } else if (pred(p)) out.push(p);
  }
  return out;
}

const read = (p: string) => readFileSync(join(REPO, p), "utf8");

// ── §20.6 — the two generated registers match §4 / §13 exactly ────────────────
describe("§20.6 — ASSUMPTIONS.md (24) and TEST-CONDITIONS.md (54)", () => {
  const assumptionsMd = read("ASSUMPTIONS.md");
  const rows = [...assumptionsMd.matchAll(/^\|\s*\*\*(A\d+(?:\.\d+)?)\*\*\s*\|(.+?)\|(.+?)\|\s*`([^`]+)`\s*\|/gm)];

  it("has exactly 24 assumption rows", () => {
    expect(rows).toHaveLength(24);
  });

  it("every assumption uses exactly one of the three legal labels", () => {
    const legal = ["Supported by SRS", "Design decision", "Unsupported"];
    for (const [, id, , label] of rows) {
      const hits = legal.filter((l) => label.includes(l));
      expect(hits, `${id}: label column = "${label.trim()}"`).toHaveLength(1);
    }
  });

  it("TEST-CONDITIONS.md has exactly 54 conditions across all 10 requirements", () => {
    const conds = [...read("TEST-CONDITIONS.md").matchAll(/^\|\s*(COND-\d+)\s*\|/gm)];
    expect(conds).toHaveLength(54);
  });
});

// ── §20.2 — every assumption has a findable comment in its anchor file ────────
describe("§20.2 — each assumption's A<n> comment lives in the file ASSUMPTIONS.md names", () => {
  const rows = [...read("ASSUMPTIONS.md").matchAll(/^\|\s*\*\*(A\d+(?:\.\d+)?)\*\*\s*\|.+?\|.+?\|\s*`([^`]+)`\s*\|/gm)];

  it.each(rows.map(([, id, file]) => ({ id, file })))("$id → $file", ({ id, file }) => {
    const src = read(file);
    // word-ish boundary so A1.1 does not match A1.10 etc.
    const re = new RegExp(`(^|[^\\w.])${id.replace(".", "\\.")}([^\\w]|$)`);
    expect(re.test(src), `${file} has no "${id}" comment`).toBe(true);
  });
});

// ── §20.8 — no "broadcast reaches all hosts" / "delivery to some" wording ─────
describe('§20.8 — wording discipline: no "reaches all" / "some recipients" claims', () => {
  const scanned = [
    ...walk(join(REPO, "packages"), (p) => /\.(ts|tsx|css)$/.test(p) && !p.includes("/tests/") && !p.endsWith(".d.ts")),
    join(REPO, "README.md"),
    join(REPO, "ASSUMPTIONS.md"),
    join(REPO, "TRACEABILITY.md"),
    join(REPO, "DEVIATIONS.md"),
  ];
  // Assertive claims that would contradict FR4's "sent to" verb or NFR9's binary wording.
  const forbidden = [
    /broadcast[^.\n]{0,60}\breach(es)?\b[^.\n]{0,30}\b(all|every|possible host)/i,
    /\breaches all\b/i,
    /deliver(ed|y|s)?[^.\n]{0,30}\bto some\b/i,
    /\bsome\b\s+(recipients|agents|hosts)\b/i,
  ];

  it("no source, harness string, or evidence doc makes the claim", () => {
    const violations: string[] = [];
    for (const file of scanned) {
      const text = readFileSync(file, "utf8");
      text.split("\n").forEach((line, i) => {
        if (/\bnever\b|\bnot\b|\bno\b|host-local/i.test(line)) return; // disciplinary lines are fine
        for (const re of forbidden) {
          if (re.test(line)) violations.push(`${relative(REPO, file)}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(violations, `\n${violations.join("\n")}`).toEqual([]);
  });
});

// ── §20.9 — non-goals (§21) not built ───────────────────────────────────────
describe("§20.9 — nothing outside §1: no DB / auth / retry layer / resequencing", () => {
  const appSrc = walk(join(REPO, "packages"), (p) => /\.(ts|tsx)$/.test(p) && !p.includes("/tests/") && !p.endsWith(".d.ts"));
  // strip line + block comments so disciplinary notes ("no resequencing") don't trip the scan
  const code = appSrc
    .map((f) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1"))
    .join("\n");
  // package manifests — the real proof that a dependency is absent
  const manifests = [
    "package.json",
    "packages/core/package.json",
    "packages/agent/package.json",
    "packages/control-plane/package.json",
    "packages/web/package.json",
  ].map((p) => read(p)).join("\n");

  it("no persistence / ORM / database dependency", () => {
    expect(/"(sequelize|typeorm|prisma|mongoose|sqlite3|better-sqlite3|pg|mysql2|knex|lowdb)"/i.test(manifests)).toBe(false);
  });
  it("no auth / login / session dependency", () => {
    expect(/"(passport|bcrypt|jsonwebtoken|express-session|next-auth|@auth\/)"/i.test(manifests)).toBe(false);
  });
  it("no retry/ack scheduler symbol in executable code (BR-23 / §21)", () => {
    expect(/\b(setInterval|setTimeout)\([^)]*retr/i.test(code)).toBe(false);
    expect(/\b(resequenceBuffer|reorderBuffer|pendingResend|ackTimeout|retryQueue)\b/.test(code)).toBe(false);
  });
});
