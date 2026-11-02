#!/usr/bin/env node
/**
 * Benchmark: does the linter separate good schemas from bad ones?
 *
 * This is the evidence behind the README's claims. It runs the linter over
 * the paired fixture sets and reports, per pair, the gap between the
 * hand-written "raw" server and the "polished" version of the same API.
 *
 * Run: node --experimental-strip-types benchmark/run.ts
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixtureFile } from "../src/loader.ts";
import { scoreServer } from "../src/score.ts";
import { grade } from "../src/score.ts";
import type { ServerReport } from "../src/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const PAIRS = ["filesystem", "web-fetch", "database"] as const;

interface PairResult {
  api: string;
  raw: ServerReport;
  polished: ServerReport;
  gap: number;
}

function load(dir: "raw" | "polished", api: string): ServerReport {
  const path = join(root, "fixtures", dir, `${api}.json`);
  const f = loadFixtureFile(path);
  return scoreServer(f.server, f.source, f.tools);
}

const results: PairResult[] = PAIRS.map((api) => {
  const raw = load("raw", api);
  const polished = load("polished", api);
  return { api, raw, polished, gap: polished.averageScore - raw.averageScore };
});

// ── invariants ──────────────────────────────────────────────────────────
const failures: string[] = [];
for (const r of results) {
  if (r.gap <= 0) {
    failures.push(`${r.api}: polished (${r.polished.averageScore}) did not beat raw (${r.raw.averageScore})`);
  }
  if (r.polished.averageScore < 70) {
    failures.push(`${r.api}: polished server scored only ${r.polished.averageScore}, expected >= 70`);
  }
  if (r.raw.averageScore > 60) {
    failures.push(`${r.api}: raw server scored ${r.raw.averageScore}, expected <= 60`);
  }
  // "Fixtures are the spec": the polished set must be free of error-level
  // findings. Warning/info findings are fine — they are the next improvement.
  for (const t of r.polished.tools) {
    for (const f of t.findings) {
      if (f.severity === "error") {
        failures.push(`${r.api}: polished tool ${t.tool} still has an error-level finding: ${f.ruleId}`);
      }
    }
  }
}

// ── report ──────────────────────────────────────────────────────────────
const pad = (s: string | number, n: number) => String(s).padEnd(n);
const num = (s: string | number, n: number) => String(s).padStart(n);

console.log("");
console.log("  Raw vs polished fixture pairs");
console.log("  " + "─".repeat(64));
console.log(
  "  " + pad("API", 14) + num("raw", 8) + num("grade", 8) + num("polished", 11) + num("grade", 8) + num("gap", 8),
);
console.log("  " + "─".repeat(64));

let totalRaw = 0;
let totalPolished = 0;
for (const r of results) {
  totalRaw += r.raw.averageScore;
  totalPolished += r.polished.averageScore;
  console.log(
    "  " +
      pad(r.api, 14) +
      num(r.raw.averageScore.toFixed(1), 8) +
      num(grade(r.raw.averageScore), 8) +
      num(r.polished.averageScore.toFixed(1), 11) +
      num(grade(r.polished.averageScore), 8) +
      num("+" + r.gap.toFixed(1), 8),
  );
}
console.log("  " + "─".repeat(64));
console.log(
  "  " +
    pad("mean", 14) +
    num((totalRaw / results.length).toFixed(1), 8) +
    num("", 8) +
    num((totalPolished / results.length).toFixed(1), 11) +
    num("", 8) +
    num("+" + ((totalPolished - totalRaw) / results.length).toFixed(1), 8),
);
console.log("");

// ── rule attribution ────────────────────────────────────────────────────
const ruleCounts = new Map<string, number>();
for (const r of results) {
  for (const t of r.raw.tools) {
    for (const f of t.findings) ruleCounts.set(f.ruleId, (ruleCounts.get(f.ruleId) ?? 0) + 1);
  }
}
const top = [...ruleCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log("  Rules that fire most on the raw fixtures");
console.log("  " + "─".repeat(64));
for (const [id, n] of top) {
  console.log("  " + pad(id, 32) + num(n + "×", 6));
}
console.log("");

// ── machine-readable sidecar ────────────────────────────────────────────
const sidecar = {
  generatedAt: new Date().toISOString(),
  pairs: results.map((r) => ({
    api: r.api,
    raw: { score: r.raw.averageScore, grade: grade(r.raw.averageScore), tools: r.raw.tools.length },
    polished: { score: r.polished.averageScore, grade: grade(r.polished.averageScore), tools: r.polished.tools.length },
    gap: Number(r.gap.toFixed(1)),
  })),
  failures,
};
const outPath = join(here, "summary.json");
writeFileSync(outPath, JSON.stringify(sidecar, null, 2) + "\n", "utf8");
console.log(`  wrote ${outPath}`);
console.log("");

if (failures.length > 0) {
  console.error("  BENCHMARK FAILED");
  for (const f of failures) console.error("   - " + f);
  process.exit(1);
}
console.log("  All invariants hold.");
console.log("");
