/**
 * Report renderers: terminal, JSON, Markdown.
 *
 * The terminal renderer is the primary UX — it must be readable at a glance
 * and always show the *fix*, not just the complaint.
 */

import { DIMENSIONS, type Dimension, type Finding, type Report, type ServerReport, type ToolScore } from "./types.ts";
import { DIMENSION_WEIGHTS, grade } from "./score.ts";

const C = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  bold: "\u001b[1m",
  red: "\u001b[31m",
  yellow: "\u001b[33m",
  blue: "\u001b[34m",
  green: "\u001b[32m",
  magenta: "\u001b[35m",
  cyan: "\u001b[36m",
  gray: "\u001b[90m",
};

export interface RenderOptions {
  color: boolean;
  verbose: boolean;
  maxFindingsPerTool: number;
}

function paint(enabled: boolean, code: string, s: string): string {
  return enabled ? `${code}${s}${C.reset}` : s;
}

function bar(score: number, width = 20): string {
  const filled = Math.round((score / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function scoreColor(score: number): string {
  if (score >= 90) return C.green;
  if (score >= 75) return C.cyan;
  if (score >= 60) return C.yellow;
  return C.red;
}

function severityTag(sev: Finding["severity"], color: boolean): string {
  switch (sev) {
    case "error":
      return paint(color, C.red, "error");
    case "warning":
      return paint(color, C.yellow, "warn ");
    default:
      return paint(color, C.blue, "info ");
  }
}

export function renderTerminal(report: Report, opts: RenderOptions): string {
  const lines: string[] = [];
  const { color } = opts;

  lines.push("");
  lines.push(paint(color, C.bold, "  mcp-tool-lint") + paint(color, C.gray, `  v${report.version}`));
  lines.push(paint(color, C.gray, `  ${report.summary.tools} tools across ${report.servers.length} server(s)`));
  lines.push("");

  for (const server of report.servers) {
    lines.push(
      paint(color, C.bold, `  ${server.server}`) +
        paint(color, C.gray, `  (${server.source})`) +
        "  " +
        paint(color, scoreColor(server.averageScore), `${server.averageScore.toFixed(1)} / 100`) +
        "  " +
        paint(color, C.gray, grade(server.averageScore)),
    );
    lines.push("");

    for (const t of server.tools) {
      lines.push(renderToolLine(t, opts));
    }
    lines.push("");
  }

  lines.push(renderSummary(report, opts));
  return lines.join("\n");
}

function renderToolLine(t: ToolScore, opts: RenderOptions): string {
  const { color } = opts;
  const pad = t.tool.padEnd(28);
  const head =
    "    " +
    paint(color, scoreColor(t.total), String(t.total.toFixed(1)).padStart(5)) +
    "  " +
    pad +
    "  " +
    paint(color, C.gray, bar(t.total, 12)) +
    "  " +
    paint(color, C.gray, grade(t.total));

  if (t.findings.length === 0) {
    return head + "  " + paint(color, C.green, "clean");
  }

  const lines = [head];
  const shown = opts.verbose ? t.findings : t.findings.slice(0, opts.maxFindingsPerTool);
  for (const f of shown) {
    lines.push(
      "          " +
        severityTag(f.severity, color) +
        "  " +
        paint(color, C.gray, f.ruleId.padEnd(26)) +
        " " +
        f.message,
    );
    if (f.fix) {
      lines.push("          " + " ".repeat(6 + 27) + paint(color, C.green, "↳ " + f.fix));
    }
  }
  const hidden = t.findings.length - shown.length;
  if (hidden > 0) {
    lines.push("          " + paint(color, C.gray, `... ${hidden} more (use --verbose)`));
  }
  return lines.join("\n");
}

function renderSummary(report: Report, opts: RenderOptions): string {
  const { color } = opts;
  const s = report.summary;
  const lines: string[] = [];
  const rule = paint(color, C.gray, "  " + "─".repeat(72));

  lines.push(rule);
  lines.push("");
  lines.push(paint(color, C.bold, "  Dimensions") + paint(color, C.gray, "   (weighted average across all tools)"));
  lines.push("");
  for (const d of DIMENSIONS) {
    const v = s.byDimension[d] ?? 0;
    lines.push(
      "    " +
        d.padEnd(12) +
        " " +
        paint(color, scoreColor(v), bar(v, 24)) +
        "  " +
        paint(color, scoreColor(v), v.toFixed(1).padStart(5)) +
        paint(color, C.gray, `  ×${DIMENSION_WEIGHTS[d].toFixed(2)}`),
    );
  }
  lines.push("");
  lines.push(rule);
  lines.push("");
  lines.push(
    "  " +
      paint(color, C.bold, "Overall") +
      "  " +
      paint(color, scoreColor(s.averageScore), `${s.averageScore.toFixed(1)} / 100`) +
      paint(color, C.gray, `  ${grade(s.averageScore)}`) +
      "   " +
      paint(color, C.red, `${s.errors} errors`) +
      paint(color, C.gray, " · ") +
      paint(color, C.yellow, `${s.warnings} warnings`),
  );
  lines.push("");

  if (s.byRule.length > 0) {
    lines.push(paint(color, C.bold, "  Top rules triggered"));
    lines.push("");
    for (const r of s.byRule.slice(0, 8)) {
      lines.push(
        "    " +
          paint(color, C.gray, String(r.count).padStart(3) + "×") +
          "  " +
          r.ruleId.padEnd(28) +
          paint(color, C.gray, `-${r.penalty} pts`),
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ───────────────────────────── markdown ─────────────────────────────

export function renderMarkdown(report: Report): string {
  const out: string[] = [];
  const s = report.summary;

  out.push("# MCP tool lint report");
  out.push("");
  out.push(`Generated ${report.generatedAt} · mcp-tool-lint v${report.version}`);
  out.push("");
  out.push(`**${s.tools} tools · ${s.errors} errors · ${s.warnings} warnings · average score ${s.averageScore.toFixed(1)}/100**`);
  out.push("");

  out.push("## Dimension scores");
  out.push("");
  out.push("| Dimension | Score | Weight |");
  out.push("|---|---:|---:|");
  for (const d of DIMENSIONS) {
    out.push(`| ${d} | ${(s.byDimension[d] ?? 0).toFixed(1)} | ×${DIMENSION_WEIGHTS[d].toFixed(2)} |`);
  }
  out.push("");

  out.push("## Servers");
  out.push("");
  out.push("| Server | Tools | Score | Grade |");
  out.push("|---|---:|---:|:---:|");
  for (const srv of report.servers) {
    out.push(`| \`${srv.server}\` | ${srv.tools.length} | ${srv.averageScore.toFixed(1)} | ${grade(srv.averageScore)} |`);
  }
  out.push("");

  for (const srv of report.servers) {
    out.push(`## \`${srv.server}\` — ${srv.averageScore.toFixed(1)}/100`);
    out.push("");
    out.push("| Tool | Score | Top issue |");
    out.push("|---|---:|:---|");
    for (const t of srv.tools) {
      const top = t.findings[0];
      const issue = top ? escapePipes(top.message) : "—";
      out.push(`| \`${t.tool}\` | ${t.total.toFixed(1)} | ${issue} |`);
    }
    out.push("");

    const withFindings = srv.tools.filter((t) => t.findings.length > 0);
    if (withFindings.length > 0) {
      out.push("<details><summary>All findings</summary>");
      out.push("");
      for (const t of withFindings) {
        out.push(`### \`${t.tool}\` — ${t.total.toFixed(1)}/100`);
        out.push("");
        for (const f of t.findings) {
          out.push(`- **${f.ruleId}** (${f.severity}, −${f.penalty}) — ${f.message}`);
          if (f.fix) out.push(`  - ↳ ${f.fix}`);
        }
        out.push("");
      }
      out.push("</details>");
      out.push("");
    }
  }

  if (s.byRule.length > 0) {
    out.push("## Rules by frequency");
    out.push("");
    out.push("| Rule | Count | Total penalty |");
    out.push("|---|---:|---:|");
    for (const r of s.byRule) {
      out.push(`| \`${r.ruleId}\` | ${r.count} | −${r.penalty} |`);
    }
    out.push("");
  }

  return out.join("\n");
}

function escapePipes(s: string): string {
  return s.replace(/\|/g, "\\|");
}

// ───────────────────────────── json ─────────────────────────────

export function renderJson(report: Report): string {
  return JSON.stringify(report, null, 2);
}

// ───────────────────────────── helpers ─────────────────────────────

export function serverReportToRows(servers: ServerReport[]): string[][] {
  return servers.map((s) => [s.server, String(s.tools.length), s.averageScore.toFixed(1), grade(s.averageScore)]);
}

export function dimensionSummary(f: Finding[]): Record<Dimension, number> {
  const out = { describing: 0, schema: 0, ambiguity: 0, safety: 0, ergonomics: 0 };
  for (const x of f) out[x.dimension] += x.penalty;
  return out;
}
