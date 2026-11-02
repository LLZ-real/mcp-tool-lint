/**
 * Public library surface.
 *
 *   import { lint, scoreTool, RULES } from "@llz-real/mcp-tool-lint";
 */

export * from "./types.ts";
export { RULES, lintTool, rulesByDimension } from "./rules.ts";
export { DIMENSION_WEIGHTS, grade, scoreServer, scoreTool } from "./score.ts";
export { buildReport, renderRuleCatalogue, VERSION } from "./report-builder.ts";
export { renderJson, renderMarkdown, renderTerminal } from "./report.ts";
export { loadFixtureFile, loadFixtures, parseFixture } from "./loader.ts";
export { probeServer, probeServerBatch, probeServerPipe } from "./probe.ts";

import { scoreServer } from "./score.ts";
import type { McpTool, ServerReport } from "./types.ts";

/** Convenience: lint one server's tool list and get its report. */
export function lint(tools: McpTool[], server = "server"): ServerReport {
  return scoreServer(server, "inline", tools);
}
