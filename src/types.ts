/**
 * Core data model for mcp-tool-lint.
 *
 * Everything here mirrors the MCP `Tool` shape (2025-06-18 spec) plus the
 * extra metadata we need to reason about *callability* rather than syntax.
 */

/** JSON Schema subset we care about. Intentionally permissive. */
export interface JSONSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  enum?: unknown[];
  items?: JSONSchema;
  default?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  oneOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  allOf?: JSONSchema[];
  $ref?: string;
  additionalProperties?: boolean | JSONSchema;
  examples?: unknown[];
  [key: string]: unknown;
}

/** An MCP tool as a server would advertise it via `tools/list`. */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: JSONSchema;
  /** MCP 2025-06-18 annotations. */
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  /** Present in some servers; we keep it for future use. */
  outputSchema?: JSONSchema;
}

/** A parsed fixture file: one server's worth of tools + provenance. */
export interface ToolFixture {
  /** Human-readable server name, e.g. "filesystem". */
  server: string;
  /** Where this came from: "fixture" | "mcp" | "openapi". */
  source: string;
  tools: McpTool[];
}

export type Dimension =
  | "describing"
  | "schema"
  | "ambiguity"
  | "safety"
  | "ergonomics";

export const DIMENSIONS: readonly Dimension[] = [
  "describing",
  "schema",
  "ambiguity",
  "safety",
  "ergonomics",
] as const;

export type Severity = "error" | "warning" | "info";

export interface Finding {
  ruleId: string;
  dimension: Dimension;
  severity: Severity;
  tool: string;
  /** Points deducted from this dimension's 0-100 score. */
  penalty: number;
  message: string;
  /** Concrete, actionable replacement text where we can generate one. */
  fix?: string;
  /** JSON pointer-ish path into the tool, e.g. "inputSchema.properties.path". */
  path?: string;
}

export interface RuleContext {
  tool: McpTool;
  /** All tools on the same server — needed for collision/ambiguity rules. */
  siblings: McpTool[];
}

export interface Rule {
  id: string;
  dimension: Dimension;
  severity: Severity;
  penalty: number;
  /** One-line human explanation shown in `explain` output. */
  summary: string;
  /** Why this matters for an LLM caller, not just for style. */
  rationale: string;
  check(ctx: RuleContext): RuleFinding[];
}

export interface RuleFinding {
  message: string;
  fix?: string;
  path?: string;
  /** Override the rule's default penalty for this specific hit. */
  penalty?: number;
}

export interface ToolScore {
  tool: string;
  total: number;
  byDimension: Record<Dimension, number>;
  findings: Finding[];
}

export interface Report {
  version: string;
  generatedAt: string;
  servers: ServerReport[];
  summary: {
    tools: number;
    findings: number;
    errors: number;
    warnings: number;
    averageScore: number;
    byDimension: Record<Dimension, number>;
    byRule: { ruleId: string; count: number; penalty: number }[];
  };
}

export interface ServerReport {
  server: string;
  source: string;
  tools: ToolScore[];
  averageScore: number;
}
