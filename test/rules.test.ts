import { strict as assert } from "node:assert";
import { test } from "node:test";
import { lintTool, RULES } from "../src/rules.ts";
import { scoreTool, DIMENSION_CAP } from "../src/score.ts";
import type { McpTool } from "../src/types.ts";

const tool = (over: Partial<McpTool> & { name: string }): McpTool => ({
  inputSchema: { type: "object", properties: {} },
  ...over,
});

function ids(findings: ReturnType<typeof lintTool>): string[] {
  return findings.map((f) => f.ruleId);
}

// ───────────────────────────── rule coverage ─────────────────────────────

test("every rule id is unique", () => {
  const seen = new Set<string>();
  for (const r of RULES) {
    assert.ok(!seen.has(r.id), `duplicate rule id: ${r.id}`);
    seen.add(r.id);
  }
});

test("every rule has a rationale long enough to be useful", () => {
  for (const r of RULES) {
    assert.ok(r.rationale.length >= 40, `${r.id} has a thin rationale`);
    assert.ok(r.penalty > 0, `${r.id} has a non-positive penalty`);
  }
});

// ───────────────────────────── describing ─────────────────────────────

test("desc/missing fires on empty description", () => {
  assert.ok(ids(lintTool(tool({ name: "read_file" }), [])).includes("desc/missing"));
});

test("desc/too-short fires below the threshold only", () => {
  const short = lintTool(tool({ name: "read_file", description: "Read a file." }), []);
  assert.ok(ids(short).includes("desc/too-short"));

  const ok = lintTool(
    tool({ name: "read_file", description: "Read a UTF-8 file and return its contents." }),
    [],
  );
  assert.ok(!ids(ok).includes("desc/too-short"));
});

test("desc/params-undocumented is suppressed when the schema documents params", () => {
  const undocumented = lintTool(
    tool({
      name: "read_file",
      description: "Read a UTF-8 file from disk and return the contents as a string.",
      inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    }),
    [],
  );
  assert.ok(ids(undocumented).includes("desc/params-undocumented"));

  const documented = lintTool(
    tool({
      name: "read_file",
      description: "Read a UTF-8 file from disk and return the contents as a string.",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string", description: "Absolute path to read." } },
        required: ["path"],
      },
    }),
    [],
  );
  assert.ok(!ids(documented).includes("desc/params-undocumented"));
});

test("desc/no-usage-cue only fires when a confusable sibling exists", () => {
  const subject = tool({
    name: "read_text_file",
    description: "Read a UTF-8 file from disk and return the contents as a string.",
  });
  // The rule requires a server large enough for routing to be a real problem.
  const filler = [
    tool({ name: "list_directory", description: "List the children of a directory." }),
    tool({ name: "stat_path", description: "Return metadata for a path." }),
    tool({ name: "delete_path", description: "Delete a file." }),
    tool({ name: "write_text_file", description: "Write a string to a file." }),
  ];
  assert.ok(!ids(lintTool(subject, [subject, ...filler])).includes("desc/no-usage-cue"));

  const confusable = tool({
    name: "read_file_bytes",
    description: "Read a file as base64 bytes.",
  });
  assert.ok(
    ids(lintTool(subject, [subject, confusable, ...filler])).includes("desc/no-usage-cue"),
  );
});

// ───────────────────────────── schema ─────────────────────────────

test("schema/missing fires when inputSchema is absent", () => {
  const t: McpTool = { name: "do_it", description: "Do the thing and return a result." };
  assert.ok(ids(lintTool(t, [])).includes("schema/missing"));
});

test("schema/untyped-param fires on a bare property", () => {
  const t = tool({
    name: "write_file",
    description: "Write a string to a file and return the byte count.",
    inputSchema: { type: "object", properties: { data: {} } },
  });
  assert.ok(ids(lintTool(t, [])).includes("schema/untyped-param"));
});

test("schema/unbounded-string is suppressed by a real description", () => {
  const bare = tool({
    name: "write_file",
    description: "Write a string to a file and return the byte count.",
    inputSchema: {
      type: "object",
      properties: { content: { type: "string" } },
      required: ["content"],
    },
  });
  assert.ok(ids(lintTool(bare, [])).includes("schema/unbounded-string"));

  const described = tool({
    name: "write_file",
    description: "Write a string to a file and return the byte count.",
    inputSchema: {
      type: "object",
      properties: { content: { type: "string", description: "UTF-8 text to write." } },
      required: ["content"],
    },
  });
  assert.ok(!ids(lintTool(described, [])).includes("schema/unbounded-string"));
});

test("schema/all-optional fires only when every param is optional", () => {
  const allOptional = tool({
    name: "search_files",
    description: "Search files by name pattern and return matching paths.",
    inputSchema: { type: "object", properties: { root: { type: "string", description: "Root." } } },
  });
  assert.ok(ids(lintTool(allOptional, [])).includes("schema/all-optional"));
});

// ───────────────────────────── ambiguity ─────────────────────────────

test("ambiguity/name-collision fires once per pair, not twice", () => {
  const a = tool({ name: "read_file", description: "Read a UTF-8 file and return its contents." });
  const b = tool({ name: "read_file_v2", description: "Read a UTF-8 file and return its contents." });
  const all = lintTool(a, [a, b]).filter((f) => f.ruleId === "ambiguity/name-collision");
  const both = [a, b].flatMap((t) => lintTool(t, [a, b])).filter((f) => f.ruleId === "ambiguity/name-collision");
  assert.equal(all.length, 1);
  assert.equal(both.length, 1, "the pair must be reported exactly once across both tools");
});

test("ambiguity/vague-verb fires on handle/process/do", () => {
  for (const name of ["handle_request", "process_data", "do_stuff"]) {
    const t = tool({ name, description: "Handles a request and returns a response object." });
    assert.ok(ids(lintTool(t, [])).includes("ambiguity/vague-verb"), name);
  }
});

test("ambiguity/no-verb does not fire on real verbs like stat", () => {
  const t = tool({
    name: "stat_path",
    description: "Return metadata for a path: size, mtime, and permissions.",
  });
  assert.ok(!ids(lintTool(t, [])).includes("ambiguity/no-verb"));
});

test("ambiguity/no-verb fires on noun-only names", () => {
  const t = tool({ name: "weather", description: "Returns the current temperature for a city." });
  assert.ok(ids(lintTool(t, [])).includes("ambiguity/no-verb"));
});

// ───────────────────────────── safety ─────────────────────────────

test("safety/destructive-undeclared fires and respects the annotation", () => {
  const undeclared = tool({ name: "delete_file", description: "Delete a file from disk permanently." });
  assert.ok(ids(lintTool(undeclared, [])).includes("safety/destructive-undeclared"));

  const declared = tool({
    name: "delete_file",
    description: "Delete a file from disk permanently.",
    annotations: { destructiveHint: true },
  });
  assert.ok(!ids(lintTool(declared, [])).includes("safety/destructive-undeclared"));
});

test("safety/readonly-misdeclared catches a lying readOnlyHint", () => {
  const liar = tool({
    name: "purge_cache",
    description: "Purge every cached entry for the session.",
    annotations: { readOnlyHint: true },
  });
  assert.ok(ids(lintTool(liar, [])).includes("safety/readonly-misdeclared"));
});

test("safety/open-world-undeclared ignores sibling cross-references", () => {
  const subject = tool({
    name: "list_directory",
    description: "List the children of a directory. Does not recurse; use search_files for that.",
    annotations: { readOnlyHint: true },
  });
  const sibling = tool({ name: "search_files", description: "Search files under a directory." });
  assert.ok(!ids(lintTool(subject, [subject, sibling])).includes("safety/open-world-undeclared"));
});

test("safety/open-world-undeclared still fires on genuinely remote tools", () => {
  const remote = tool({
    name: "fetch_url",
    description: "Fetch a URL over HTTP and return the response body.",
    annotations: { readOnlyHint: true },
  });
  assert.ok(ids(lintTool(remote, [])).includes("safety/open-world-undeclared"));
});

// ───────────────────────────── ergonomics ─────────────────────────────

test("ergonomics/god-tool fires above 8 params", () => {
  const props: Record<string, { type: string; description: string }> = {};
  for (let i = 0; i < 9; i++) props[`opt_${i}`] = { type: "string", description: `Option ${i}.` };
  const t = tool({
    name: "configure_everything",
    description: "Configure the service and return the applied settings.",
    inputSchema: { type: "object", properties: props, required: ["opt_0"] },
  });
  assert.ok(ids(lintTool(t, [])).includes("ergonomics/god-tool"));
});

test("ergonomics/mode-without-enum fires on a free-form mode param", () => {
  const t = tool({
    name: "convert_image",
    description: "Convert an image between formats and return the output path.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", format: "path", description: "Input image path." },
        mode: { type: "string" },
      },
      required: ["path"],
    },
  });
  assert.ok(ids(lintTool(t, [])).includes("ergonomics/mode-without-enum"));
});

test("ergonomics/boolean-trap only fires on mode-like booleans", () => {
  const independent = tool({
    name: "write_file",
    description: "Write a string to a file and return the byte count.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", format: "path", description: "Destination path." },
        content: { type: "string", description: "UTF-8 text to write." },
        append: { type: "boolean", description: "Append instead of overwriting." },
        create_parents: { type: "boolean", description: "Create missing directories." },
      },
      required: ["path", "content"],
    },
  });
  // append/create_parents are independent switches, not a mode pair.
  assert.ok(!ids(lintTool(independent, [])).includes("ergonomics/boolean-trap"));

  const modePair = tool({
    name: "list_directory",
    description: "List the children of a directory and return their names.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", format: "path", description: "Directory to list." },
        recursive: { type: "boolean", description: "Recurse into subdirectories." },
        shallow: { type: "boolean", description: "Only the top level." },
      },
      required: ["path"],
    },
  });
  assert.ok(ids(lintTool(modePair, [])).includes("ergonomics/boolean-trap"));
});

// ───────────────────────────── scoring ─────────────────────────────

test("a clean tool scores 100", () => {
  const clean = tool({
    name: "read_text_file",
    description:
      "Read a UTF-8 text file from disk and return its contents as a string. Returns an error if the file does not exist.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", format: "path", description: "Absolute path of the file to read." },
      },
      required: ["path"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  });
  assert.equal(scoreTool(clean, [clean]).total, 100);
});

test("critical rules impose a hard ceiling", () => {
  const broken = tool({ name: "mystery" }); // no description, no schema
  assert.ok(scoreTool(broken, []).total <= 40);
});

test("dimension deductions are capped", () => {
  const props: Record<string, { type: string }> = {};
  for (let i = 0; i < 20; i++) props[`p${i}`] = { type: "string" };
  const awful = tool({
    name: "process_data",
    description: "Processes data.",
    inputSchema: { type: "object", properties: props },
  });
  const s = scoreTool(awful, [awful]);
  for (const [dim, value] of Object.entries(s.byDimension)) {
    assert.ok(value >= 100 - DIMENSION_CAP, `${dim} broke the cap: ${value}`);
  }
});

test("score is monotonically non-increasing as findings are added", () => {
  const base: McpTool = {
    name: "read_file",
    description: "Read a UTF-8 file from disk and return its contents as a string.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", format: "path", description: "Absolute path." } },
      required: ["path"],
    },
    annotations: { readOnlyHint: true },
  };
  const worse: McpTool = { ...base, description: "Read a file." };
  assert.ok(scoreTool(worse, [worse]).total < scoreTool(base, [base]).total);
});
