/**
 * Report assembly + rule catalogue rendering.
 */

import { DIMENSIONS, type Dimension, type Report, type ServerReport, type ToolFixture } from "./types.ts";
import { RULES, rulesByDimension } from "./rules.ts";
import { round, scoreServer } from "./score.ts";

export const VERSION = "0.1.0";

export function buildReport(fixtures: ToolFixture[]): Report {
  const servers: ServerReport[] = fixtures.map((f) => scoreServer(f.server, f.source, f.tools));

  const byDimension = Object.fromEntries(DIMENSIONS.map((d) => [d, 0])) as Record<Dimension, number>;
  const byRule = new Map<string, { count: number; penalty: number }>();
  let toolCount = 0;
  let errors = 0;
  let warnings = 0;

  // Dimension averages are over *tools*, not over findings: a server with one
  // terrible tool should not be dragged down by 20 hits of the same rule.
  const dimSums = Object.fromEntries(DIMENSIONS.map((d) => [d, 0])) as Record<Dimension, number>;

  for (const srv of servers) {
    for (const t of srv.tools) {
      toolCount++;
      for (const d of DIMENSIONS) dimSums[d] += t.byDimension[d];
      for (const f of t.findings) {
        if (f.severity === "error") errors++;
        if (f.severity === "warning") warnings++;
        const cur = byRule.get(f.ruleId) ?? { count: 0, penalty: 0 };
        cur.count++;
        cur.penalty += f.penalty;
        byRule.set(f.ruleId, cur);
      }
    }
  }

  for (const d of DIMENSIONS) {
    byDimension[d] = toolCount === 0 ? 100 : round(dimSums[d] / toolCount);
  }

  const averageScore =
    toolCount === 0
      ? 100
      : round(servers.reduce((a, s) => a + s.averageScore * s.tools.length, 0) / toolCount);

  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    servers,
    summary: {
      tools: toolCount,
      findings: [...byRule.values()].reduce((a, b) => a + b.count, 0),
      errors,
      warnings,
      averageScore,
      byDimension,
      byRule: [...byRule.entries()]
        .map(([ruleId, v]) => ({ ruleId, ...v }))
        .sort((a, b) => b.count - a.count || a.ruleId.localeCompare(b.ruleId)),
    },
  };
}

export function renderRuleCatalogue(): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`  ${RULES.length} rules across ${DIMENSIONS.length} dimensions`);
  lines.push("");
  const grouped = rulesByDimension();
  for (const d of DIMENSIONS) {
    const rules = grouped.get(d) ?? [];
    lines.push(`  ${d.toUpperCase()}  (${rules.length})`);
    for (const r of rules) {
      lines.push(`    ${r.id.padEnd(28)} -${String(r.penalty).padStart(2)}  ${r.summary}`);
      for (const w of wrap(r.rationale, 66)) lines.push(`      ${w}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur.length + w.length + 1 > width) {
      out.push(cur);
      cur = w;
    } else {
      cur = cur.length === 0 ? w : `${cur} ${w}`;
    }
  }
  if (cur) out.push(cur);
  return out;
}
