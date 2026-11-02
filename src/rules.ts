/**
 * The rule set.
 *
 * Design constraint: every rule must be explainable in one sentence to the
 * person running the linter, and must correspond to a way an LLM caller
 * *actually* fails. Rules that only police style are deliberately excluded.
 */

import type { Finding, JSONSchema, McpTool, Rule, RuleContext, RuleFinding } from "./types.ts";
import {
  areConfusable,
  confusability,
  containsDestructiveWord,
  containsNetworkWord,
  firstWord,
  genericPhraseHits,
  hasStrongVerb,
  hasUsageCue,
  isBooleanish,
  isUselessParamName,
  isVagueVerb,
  mentionsParam,
  namingConvention,
  splitWords,
  stripSiblingMentions,
} from "./text.ts";

function propsOf(tool: McpTool): [string, JSONSchema][] {
  return Object.entries(tool.inputSchema?.properties ?? {});
}

function requiredOf(tool: McpTool): string[] {
  return tool.inputSchema?.required ?? [];
}

/** A string param with no shape at all — the model must guess the format. */
function isUnboundedString(s: JSONSchema): boolean {
  if (s.type !== "string") return false;
  return !s.enum && !s.pattern && !s.format && !s.maxLength && !s.examples?.length;
}

/** Params whose name implies a closed set of values. */
const MODE_PARAMS = new Set([
  "mode", "action", "op", "operation", "type", "kind", "method", "strategy",
  "level", "format", "variant", "sort", "order", "direction", "scope",
  "target", "env", "environment", "platform", "language", "encoding",
]);

function looksLikeModeParam(name: string): boolean {
  const words = splitWords(name);
  return words.some((w) => MODE_PARAMS.has(w));
}

const rules: Rule[] = [
  // ───────────────────────────── describing ─────────────────────────────
  {
    id: "desc/missing",
    dimension: "describing",
    severity: "error",
    penalty: 40,
    summary: "Tool has no description",
    rationale:
      "The description is the only thing an LLM sees when deciding whether to call a tool. Without it the tool is effectively invisible.",
    check({ tool }) {
      if (tool.description && tool.description.trim().length > 0) return [];
      return [
        {
          message: `\`${tool.name}\` has no description — the model cannot tell what it does.`,
          fix: `Add a description starting with a verb, e.g. "${suggestDescription(tool)}"`,
          path: "description",
        },
      ];
    },
  },
  {
    id: "desc/too-short",
    dimension: "describing",
    severity: "error",
    penalty: 25,
    summary: "Description is too short to route on",
    rationale:
      "Under ~25 characters there is rarely enough signal to distinguish this tool from its siblings.",
    check({ tool }) {
      const d = (tool.description ?? "").trim();
      if (d.length === 0 || d.length >= 25) return [];
      return [
        {
          message: `Description is only ${d.length} chars ("${d}") — too short to distinguish from sibling tools.`,
          fix: "Expand to at least one sentence: what it does + what it returns.",
          path: "description",
        },
      ];
    },
  },
  {
    id: "desc/generic",
    dimension: "describing",
    severity: "warning",
    penalty: 10,
    summary: "Description uses generic filler phrases",
    rationale:
      "Phrases like \"this tool\" or \"utility\" consume tokens without adding discriminative signal.",
    check({ tool }) {
      const hits = genericPhraseHits(tool.description ?? "");
      if (hits.length === 0) return [];
      return [
        {
          message: `Generic filler: ${hits.map((h) => `"${h}"`).join(", ")}.`,
          fix: "Replace filler with the concrete object and effect, e.g. \"Reads a UTF-8 file from disk and returns its contents\".",
          path: "description",
          penalty: Math.min(10, 4 * hits.length),
        },
      ];
    },
  },
  {
    id: "desc/no-usage-cue",
    dimension: "describing",
    severity: "warning",
    penalty: 8,
    summary: "No guidance on when to prefer this tool",
    rationale:
      "When a server exposes several similar tools, the description must disambiguate. \"When to use\" cues are the cheapest way to do it.",
    check({ tool, siblings }) {
      if (siblings.length < 4) return [];
      const d = tool.description ?? "";
      if (d.length === 0 || hasUsageCue(d)) return [];

      // Only a problem if some sibling is close enough to be confused with.
      const confusable = siblings.filter(
        (s) => s.name !== tool.name && areConfusable(tool.name, s.name),
      );
      if (confusable.length === 0) return [];

      return [
        {
          message: `Description never says when to use it instead of \`${confusable[0]!.name}\`.`,
          fix: `Add a disambiguating clause, e.g. "Use this for text; use ${confusable[0]!.name} for binary files."`,
          path: "description",
        },
      ];
    },
  },
  {
    id: "desc/params-undocumented",
    dimension: "describing",
    severity: "warning",
    penalty: 10,
    summary: "Required params are not mentioned in the description",
    rationale:
      "If the description never references a required parameter, the model has to infer it from the schema alone — a common source of malformed calls.",
    check({ tool }) {
      const d = tool.description ?? "";
      const req = requiredOf(tool);
      if (d.length === 0 || req.length === 0) return [];

      // If every required param documents itself in the schema, the model has
      // what it needs; repeating names in the prose adds nothing.
      const selfDocumented = req.every((p) => {
        const s = tool.inputSchema?.properties?.[p];
        return Boolean(s?.description && s.description.trim().length > 0);
      });
      if (selfDocumented) return [];

      const unmentioned = req.filter((p) => !mentionsParam(d, p));
      if (unmentioned.length === 0) return [];
      // Only flag when *none* are mentioned: partial coverage is normal.
      if (unmentioned.length < req.length) return [];
      return [
        {
          message: `None of the required params (${req.join(", ")}) appear in the description.`,
          fix: `Mention ${unmentioned.map((p) => `\`${p}\``).join(", ")} in the description, or give ${unmentioned.length > 1 ? "them" : "it"} a \`description\` in the schema.`,
          path: "description",
        },
      ];
    },
  },
  {
    id: "desc/no-return",
    dimension: "describing",
    severity: "info",
    penalty: 4,
    summary: "Description does not say what is returned",
    rationale:
      "Knowing the return shape lets the model decide whether the result is worth using without a follow-up call.",
    check({ tool }) {
      const d = (tool.description ?? "").toLowerCase();
      if (d.length === 0) return [];
      const cues = ["return", "returns", "yields", "output", "result", "responds", "produces", "emits", "gives"];
      if (cues.some((c) => d.includes(c))) return [];
      if (tool.outputSchema) return [];
      return [
        {
          message: "Description never states what the tool returns.",
          fix: 'Append a returns clause, e.g. "Returns the file contents as a UTF-8 string."',
          path: "description",
        },
      ];
    },
  },

  // ────────────────────────────── schema ────────────────────────────────
  {
    id: "schema/missing",
    dimension: "schema",
    severity: "error",
    penalty: 30,
    summary: "Tool declares no input schema",
    rationale:
      "Without inputSchema the model must guess the argument shape, and most clients will reject the call outright.",
    check({ tool }) {
      if (tool.inputSchema && typeof tool.inputSchema === "object") return [];
      return [
        {
          message: `\`${tool.name}\` has no inputSchema.`,
          fix: 'Add at least `{ "type": "object", "properties": {} }` for zero-arg tools.',
          path: "inputSchema",
        },
      ];
    },
  },
  {
    id: "schema/untyped-param",
    dimension: "schema",
    severity: "error",
    penalty: 12,
    summary: "Parameter has no JSON type",
    rationale:
      "Untyped params force the model to guess between string/number/boolean — one of the top causes of validation errors.",
    check({ tool }) {
      const out: RuleFinding[] = [];
      for (const [name, s] of propsOf(tool)) {
        if (!s.type && !s.enum && !s.oneOf && !s.anyOf && !s.$ref) {
          out.push({
            message: `Param \`${name}\` declares no \`type\`.`,
            fix: `Add "type": ${inferType(s)}`,
            path: `inputSchema.properties.${name}`,
          });
        }
      }
      return out;
    },
  },
  {
    id: "schema/param-undescribed",
    dimension: "schema",
    severity: "warning",
    penalty: 6,
    summary: "Parameter has no description",
    rationale:
      "Per-parameter descriptions are rendered next to the field in most clients; empty ones are the single most common MCP quality gap.",
    check({ tool }) {
      const out: RuleFinding[] = [];
      for (const [name, s] of propsOf(tool)) {
        if (s.description && s.description.trim().length > 0) continue;
        if (s.enum) continue; // the enum values themselves carry the meaning
        out.push({
          message: `Param \`${name}\` has no description.`,
          fix: `Add "description": "${describeFromSchema(name, s)}"`,
          path: `inputSchema.properties.${name}`,
        });
      }
      // Cap so one terrible schema does not dominate the whole score.
      return out.slice(0, 5);
    },
  },
  {
    id: "schema/unbounded-string",
    dimension: "schema",
    severity: "warning",
    penalty: 5,
    summary: "Free-form string with no format hint",
    rationale:
      "A bare `type: string` gives no clue whether the value is a path, a URL, an ISO date, or an ID.",
    check({ tool }) {
      const out: RuleFinding[] = [];
      for (const [name, s] of propsOf(tool)) {
        if (!isUnboundedString(s)) continue;
        // A documented free-form string (e.g. file contents, a regex) is fine:
        // there is no format to give. Only flag undocumented ones.
        if (s.description && s.description.trim().length >= 10) continue;
        out.push({
          message: `String param \`${name}\` has no \`format\`, \`pattern\`, \`enum\`, \`examples\`, or description.`,
          fix: `Add "format" (e.g. "uri", "date-time", "path"), "examples": [...], or at minimum a \`description\`.`,
          path: `inputSchema.properties.${name}`,
          penalty: 3,
        });
      }
      return out.slice(0, 4);
    },
  },
  {
    id: "schema/weak-param-name",
    dimension: "schema",
    severity: "warning",
    penalty: 8,
    summary: "Parameter name carries no meaning",
    rationale:
      "Names like `data`, `id`, or `x` force the model to rely entirely on the description — and the description is often missing too.",
    check({ tool }) {
      const out: RuleFinding[] = [];
      for (const [name] of propsOf(tool)) {
        if (!isUselessParamName(name)) continue;
        out.push({
          message: `Param name \`${name}\` is not self-describing.`,
          fix: "Rename to what it holds, e.g. `file_path`, `query`, `max_results`.",
          path: `inputSchema.properties.${name}`,
        });
      }
      return out;
    },
  },
  {
    id: "schema/bare-object",
    dimension: "schema",
    severity: "warning",
    penalty: 10,
    summary: "Nested object without a properties definition",
    rationale:
      "A nested `type: object` with no properties is an unconstrained blob; the model will hallucinate a shape.",
    check({ tool }) {
      const out: RuleFinding[] = [];
      for (const [name, s] of propsOf(tool)) {
        // `additionalProperties: false` closes the shape, and a schema-valued
        // `additionalProperties` (e.g. `{"type":"string"}`) constrains it too;
        // only `true`/`{}`/missing leaves the object unconstrained.
        const ap = s.additionalProperties;
        const constrained =
          ap === false || (typeof ap === "object" && ap !== null && Object.keys(ap).length > 0);
        if (s.type === "object" && !s.properties && !constrained) {
          out.push({
            message: `Param \`${name}\` is an unconstrained object.`,
            fix: 'Declare `"properties"`, or set `"additionalProperties": false` if the shape is fixed.',
            path: `inputSchema.properties.${name}`,
          });
        }
      }
      return out;
    },
  },
  {
    id: "schema/all-optional",
    dimension: "schema",
    severity: "warning",
    penalty: 8,
    summary: "Every parameter is optional",
    rationale:
      "With no required field the model has no anchor for a minimal valid call and tends to over-supply arguments.",
    check({ tool }) {
      const props = propsOf(tool);
      if (props.length === 0) return [];
      if (requiredOf(tool).length > 0) return [];
      return [
        {
          message: `All ${props.length} params are optional; nothing anchors a minimal call.`,
          fix: "Mark the semantically necessary one(s) as required.",
          path: "inputSchema.required",
        },
      ];
    },
  },

  // ───────────────────────────── ambiguity ──────────────────────────────
  {
    id: "ambiguity/name-collision",
    dimension: "ambiguity",
    severity: "error",
    penalty: 20,
    summary: "Tool name is near-identical to a sibling",
    rationale:
      "When two tools look alike by name, the model picks one at random — this is the highest-impact failure mode in large MCP servers.",
    check({ tool, siblings }) {
      const out: RuleFinding[] = [];
      for (const other of siblings) {
        if (other.name === tool.name) continue;
        // Symmetric on purpose: both names in the pair are risky to route to,
        // so both tools carry the finding and the critical ceiling.
        const c = confusability(tool.name, other.name);
        if (c >= 0.6) {
          out.push({
            message: `\`${tool.name}\` and \`${other.name}\` are ${(c * 100).toFixed(0)}% confusable — same verb, overlapping object.`,
            fix: "Rename one to reflect the distinguishing dimension (scope, target, format), or merge them behind a `mode` enum.",
            path: "name",
          });
        }
      }
      return out;
    },
  },
  {
    id: "ambiguity/vague-verb",
    dimension: "ambiguity",
    severity: "warning",
    penalty: 10,
    summary: "Tool name starts with a vague verb",
    rationale:
      "`do_thing`, `handle_request`, `process_data` tell the model nothing about the effect, so it cannot plan with them.",
    check({ tool }) {
      const w = firstWord(tool.name);
      if (!isVagueVerb(w)) return [];
      return [
        {
          message: `Name starts with vague verb \`${w}\`.`,
          fix: "Use a specific verb: read/write/create/delete/search/list/convert/...",
          path: "name",
        },
      ];
    },
  },
  {
    id: "ambiguity/no-verb",
    dimension: "ambiguity",
    severity: "warning",
    penalty: 8,
    summary: "Tool name contains no action verb",
    rationale:
      "A noun-only name (`weather`, `database`) reads like a resource, not an operation; the model cannot tell what calling it does.",
    check({ tool }) {
      if (hasStrongVerb(tool.name)) return [];
      if (firstWord(tool.name) && isVagueVerb(firstWord(tool.name))) return []; // already flagged
      return [
        {
          message: `\`${tool.name}\` reads as a noun; no verb describes the effect.`,
          fix: `Rename to \`${guessVerb(tool)}_${tool.name.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase()}\`.`,
          path: "name",
        },
      ];
    },
  },
  {
    id: "ambiguity/inconsistent-naming",
    dimension: "ambiguity",
    severity: "info",
    penalty: 3,
    summary: "Naming convention differs from the server majority",
    rationale:
      "Mixed conventions (`read_file` next to `readFile`) make lexical matching less reliable for both humans and models.",
    check({ tool, siblings }) {
      if (siblings.length < 5) return [];
      const counts = new Map<string, number>();
      for (const s of siblings) {
        const c = namingConvention(s.name);
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      const mine = namingConvention(tool.name);
      const majority = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!majority || majority[0] === mine) return [];
      if ((counts.get(mine) ?? 0) > 1) return [];
      return [
        {
          message: `\`${tool.name}\` is ${mine}Case-ish while most tools are ${majority[0]}.`,
          fix: `Follow the dominant convention (${majority[0]}).`,
          path: "name",
        },
      ];
    },
  },

  // ────────────────────────────── safety ────────────────────────────────
  {
    id: "safety/destructive-undeclared",
    dimension: "safety",
    severity: "warning",
    penalty: 15,
    summary: "Destructive tool without destructiveHint",
    rationale:
      "Clients use annotations to decide whether to ask for confirmation. An undeclared destructive tool can be auto-approved by an agent.",
    check({ tool }) {
      if (!containsDestructiveWord(tool.name, tool.description ?? "")) return [];
      if (tool.annotations?.destructiveHint === true) return [];
      return [
        {
          message: `Name/description implies destruction but \`destructiveHint\` is not \`true\`.`,
          fix: 'Set `"annotations": { "destructiveHint": true }` so clients can gate it behind confirmation.',
          path: "annotations",
        },
      ];
    },
  },
  {
    id: "safety/readonly-misdeclared",
    dimension: "safety",
    severity: "error",
    penalty: 20,
    summary: "Tool claims read-only but mutates",
    rationale:
      "A false `readOnlyHint` is worse than no annotation: clients may run it in parallel or without approval.",
    check({ tool }) {
      if (tool.annotations?.readOnlyHint !== true) return [];
      if (!containsDestructiveWord(tool.name, tool.description ?? "")) return [];
      return [
        {
          message: "`readOnlyHint: true` contradicts destructive wording in the name/description.",
          fix: "Remove `readOnlyHint`, or set it to `false` and add `destructiveHint: true`.",
          path: "annotations.readOnlyHint",
        },
      ];
    },
  },
  {
    id: "safety/no-annotations",
    dimension: "safety",
    severity: "info",
    penalty: 5,
    summary: "No annotations at all",
    rationale:
      "Without any hint, clients must assume the worst case and prompt the user for every call.",
    check({ tool }) {
      const a = tool.annotations;
      if (a && (a.readOnlyHint !== undefined || a.destructiveHint !== undefined || a.openWorldHint !== undefined)) {
        return [];
      }
      return [
        {
          message: "No `annotations` block; clients cannot classify risk.",
          fix: 'Add at least `{ "readOnlyHint": true }` or `{ "destructiveHint": true }`.',
          path: "annotations",
        },
      ];
    },
  },
  {
    id: "safety/open-world-undeclared",
    dimension: "safety",
    severity: "info",
    penalty: 6,
    summary: "Network-facing tool without openWorldHint",
    rationale:
      "`openWorldHint: true` tells the client the tool reaches the public internet, which matters for data-exfiltration review.",
    check({ tool, siblings }) {
      // Cross-references to siblings ("use search_files instead") are guidance,
      // not evidence that this tool itself goes to the network.
      const text = stripSiblingMentions(
        `${tool.name} ${tool.description ?? ""}`,
        siblings.filter((s) => s.name !== tool.name).map((s) => s.name),
      );
      if (!containsNetworkWord(text)) return [];
      if (tool.annotations?.openWorldHint === true) return [];
      return [
        {
          message: "Tool appears to reach the network but `openWorldHint` is not `true`.",
          fix: 'Set `"openWorldHint": true`.',
          path: "annotations",
        },
      ];
    },
  },

  // ───────────────────────────── ergonomics ─────────────────────────────
  {
    id: "ergonomics/god-tool",
    dimension: "ergonomics",
    severity: "warning",
    penalty: 10,
    summary: "Tool takes too many parameters",
    rationale:
      "Beyond ~8 params the model starts dropping or inventing fields. Splitting the tool is usually better than documenting harder.",
    check({ tool }) {
      const n = propsOf(tool).length;
      if (n <= 8) return [];
      return [
        {
          message: `\`${tool.name}\` takes ${n} params.`,
          fix: "Split into focused tools, or nest the optional ones under one object param.",
          path: "inputSchema.properties",
        },
      ];
    },
  },
  {
    id: "ergonomics/mode-without-enum",
    dimension: "ergonomics",
    severity: "warning",
    penalty: 8,
    summary: "Mode-like parameter has no enum",
    rationale:
      "When a param is called `mode`/`action`/`format`, the model must be told the legal values or it will invent them.",
    check({ tool }) {
      const out: RuleFinding[] = [];
      for (const [name, s] of propsOf(tool)) {
        if (!looksLikeModeParam(name)) continue;
        if (s.enum && s.enum.length > 0) continue;
        if (s.type !== "string" && s.type !== undefined) continue;
        out.push({
          message: `Mode-like param \`${name}\` has no \`enum\`.`,
          fix: `Add "enum": [...] listing every legal value.`,
          path: `inputSchema.properties.${name}`,
        });
      }
      return out;
    },
  },
  {
    id: "ergonomics/boolean-trap",
    dimension: "ergonomics",
    severity: "warning",
    penalty: 6,
    summary: "Boolean flags that read as a mode switch",
    rationale:
      "`recursive` vs `shallow`, `force` vs `safe`: mutually exclusive intent expressed as booleans invites contradictory calls. Independent on/off switches are fine.",
    check({ tool }) {
      const bools = propsOf(tool)
        .filter(([, s]) => isBooleanish(s.type))
        .map(([n]) => n);
      // Only flag when the booleans describe *how* to run, not independent extras.
      const modeish = bools.filter((b) => looksLikeModeParam(b) || MODE_BOOLS.has(b.toLowerCase()));
      if (modeish.length < 2) return [];
      return [
        {
          message: `${modeish.length} mode-like boolean flags (${modeish.join(", ")}) — ${2 ** modeish.length} combinations, some contradictory.`,
          fix: "Replace mutually exclusive flags with a single `mode` enum, e.g. `\"mode\": \"recursive\" | \"shallow\"`.",
          path: "inputSchema.properties",
          penalty: Math.min(12, 4 * modeish.length),
        },
      ];
    },
  },
];

/** Booleans whose names imply "which variant" rather than "also do this". */
const MODE_BOOLS = new Set([
  "recursive", "force", "overwrite", "dry_run", "dryrun", "verbose", "quiet",
  "shallow", "deep", "async", "sync", "stream", "raw", "pretty", "strict",
  "case_sensitive", "whole_word", "follow_symlinks", "create_parents",
  "include_hidden", "ignore_case", "exact", "fuzzy", "sorted", "reverse",
]);

// ───────────────────────────── helpers ─────────────────────────────

function inferType(s: JSONSchema): string {
  if (s.enum && s.enum.length > 0) return JSON.stringify(typeof s.enum[0]);
  if (s.properties) return '"object"';
  if (s.items) return '"array"';
  if (typeof s.minimum === "number" || typeof s.maximum === "number") return '"number"';
  return '"string"';
}

function describeFromSchema(name: string, s: JSONSchema): string {
  const human = name.replace(/[_-]+/g, " ");
  switch (s.type) {
    case "string":
      if (s.format === "uri") return `Absolute URI for the ${human}.`;
      if (s.format === "date-time") return `ISO-8601 timestamp for the ${human}.`;
      return `The ${human}.`;
    case "number":
    case "integer":
      return `The ${human} as a number.`;
    case "boolean":
      return `Whether to enable \`${name}\`.`;
    case "array":
      return `List of ${human.replace(/s$/, "")} values.`;
    case "object":
      return `The ${human} object.`;
    default:
      return `The ${human}.`;
  }
}

function suggestDescription(tool: McpTool): string {
  const props = propsOf(tool).map(([n]) => n);
  const argHint = props.length > 0 ? ` given ${props.slice(0, 2).join(" and ")}` : "";
  return `Performs <what> on <target>${argHint} and returns <result>.`;
}

function guessVerb(tool: McpTool): string {
  const d = (tool.description ?? "").toLowerCase();
  if (/read|load|get|fetch/.test(d)) return "get";
  if (/write|save|store/.test(d)) return "write";
  if (/list|enumerate/.test(d)) return "list";
  if (/search|find|query/.test(d)) return "search";
  if (/delete|remove/.test(d)) return "delete";
  return "get";
}

export const RULES: readonly Rule[] = rules;

export function rulesByDimension(): Map<string, Rule[]> {
  const m = new Map<string, Rule[]>();
  for (const r of RULES) {
    const arr = m.get(r.dimension) ?? [];
    arr.push(r);
    m.set(r.dimension, arr);
  }
  return m;
}

/** Run every rule against one tool and flatten to findings. */
export function lintTool(tool: McpTool, siblings: McpTool[]): Finding[] {
  const ctx: RuleContext = { tool, siblings };
  const out: Finding[] = [];
  for (const rule of RULES) {
    for (const f of rule.check(ctx)) {
      out.push({
        ruleId: rule.id,
        dimension: rule.dimension,
        severity: rule.severity,
        tool: tool.name,
        penalty: f.penalty ?? rule.penalty,
        message: f.message,
        ...(f.fix !== undefined ? { fix: f.fix } : {}),
        ...(f.path !== undefined ? { path: f.path } : {}),
      });
    }
  }
  return out;
}
