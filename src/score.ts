/**
 * Scoring.
 *
 * Model: start at 100 and subtract every deduction, with a per-dimension cap
 * so that one pathological dimension cannot zero the tool by itself.
 *
 * Why additive rather than a weighted average of dimension scores:
 * a weighted average is far too forgiving. A tool whose description is
 * literally "Read a file." has describing=57 but still scored 81/100 under
 * the old model, because the other four dimensions averaged the failure away.
 * Deductions are what a reader actually cares about, so they accumulate.
 *
 * Why the per-dimension cap: ten minor `info` hits in the same dimension
 * should not outweigh one critical `error` elsewhere. Capping each dimension
 * at 55 keeps the dimensions proportional while still letting a genuinely
 * broken tool fall to (or near) zero.
 */

import { DIMENSIONS, type Dimension, type Finding, type McpTool, type ServerReport, type ToolScore } from "./types.ts";
import { lintTool } from "./rules.ts";

/**
 * Relative importance, used only for reporting and for the `--fail-under`
 * guidance. The score itself is additive, not weighted.
 */
export const DIMENSION_WEIGHTS: Record<Dimension, number> = {
  describing: 0.34,
  schema: 0.28,
  ambiguity: 0.20,
  safety: 0.10,
  ergonomics: 0.08,
};

/** Maximum points one dimension may deduct from the total. */
export const DIMENSION_CAP = 55;

/**
 * Rules whose presence means the tool is not usable by an LLM at all.
 * These impose a hard ceiling regardless of how good the rest is.
 */
const CRITICAL_RULES = new Set([
  "desc/missing",
  "schema/missing",
  "ambiguity/name-collision",
  "safety/readonly-misdeclared",
]);

const CRITICAL_CEILING = 40;

export function scoreTool(tool: McpTool, siblings: McpTool[]): ToolScore {
  const findings = lintTool(tool, siblings);

  const rawDeduction: Record<Dimension, number> = {
    describing: 0,
    schema: 0,
    ambiguity: 0,
    safety: 0,
    ergonomics: 0,
  };
  for (const f of findings) rawDeduction[f.dimension] += f.penalty;

  const byDimension = { ...rawDeduction };
  for (const d of DIMENSIONS) {
    byDimension[d] = Math.max(0, 100 - Math.min(DIMENSION_CAP, rawDeduction[d]));
  }

  const totalDeduction = DIMENSIONS.reduce(
    (acc, d) => acc + Math.min(DIMENSION_CAP, rawDeduction[d]),
    0,
  );
  let total = Math.max(0, 100 - totalDeduction);

  const critical = findings.filter((f) => CRITICAL_RULES.has(f.ruleId));
  if (critical.length > 0) total = Math.min(total, CRITICAL_CEILING);

  return {
    tool: tool.name,
    total: round(total),
    byDimension,
    findings: sortFindings(findings),
  };
}

export function scoreServer(server: string, source: string, tools: McpTool[]): ServerReport {
  const scored = tools.map((t) => scoreTool(t, tools));
  const avg = scored.length === 0 ? 100 : scored.reduce((a, b) => a + b.total, 0) / scored.length;
  return { server, source, tools: scored, averageScore: round(avg) };
}

export function emptyDimensions(): Record<Dimension, number> {
  return { describing: 0, schema: 0, ambiguity: 0, safety: 0, ergonomics: 0 };
}

export function round(n: number, places = 1): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    if (b.penalty !== a.penalty) return b.penalty - a.penalty;
    return a.ruleId.localeCompare(b.ruleId);
  });
}

export function grade(total: number): "A" | "B" | "C" | "D" | "F" {
  if (total >= 90) return "A";
  if (total >= 80) return "B";
  if (total >= 70) return "C";
  if (total >= 60) return "D";
  return "F";
}
