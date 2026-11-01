import { strict as assert } from "node:assert";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseToolsList, normalizeTool, probeServerBatch, McpProbeError } from "../src/probe.ts";

const here = dirname(fileURLToPath(import.meta.url));
const demoServer = join(here, "..", "fixtures", "demo-server.mjs");

// ───────────────────────────── parsing ─────────────────────────────

test("parseToolsList accepts a well-formed result", () => {
  const tools = parseToolsList({ tools: [{ name: "a" }, { name: "b", description: "B." }] });
  assert.equal(tools.length, 2);
  assert.equal(tools[0]!.name, "a");
  assert.equal(tools[1]!.description, "B.");
});

test("parseToolsList rejects malformed results with a useful message", () => {
  assert.throws(() => parseToolsList({}), McpProbeError);
  assert.throws(() => parseToolsList({ tools: "nope" }), McpProbeError);
  assert.throws(() => parseToolsList(null), McpProbeError);
});

test("normalizeTool tolerates missing and unexpected fields", () => {
  const t = normalizeTool({ name: "x", inputSchema: { type: "object" }, extra: 1 }, 0);
  assert.equal(t.name, "x");
  assert.deepEqual(t.inputSchema, { type: "object" });

  const unnamed = normalizeTool({}, 3);
  assert.equal(unnamed.name, "tool_3");
});

// ───────────────────────────── live probe ─────────────────────────────

test("probeServerBatch completes a real MCP handshake and lists tools", async () => {
  // Use the workspace as the scratch dir: system temp may be unwritable
  // in sandboxed environments, and this test must not depend on that.
  // `demoServer` is absolute, so it resolves regardless of the child's cwd.
  const res = await probeServerBatch({ command: process.execPath, args: [demoServer] }, 15_000, here);

  assert.equal(res.tools.length, 4, `probe returned ${res.tools.length} tools`);
  assert.deepEqual(
    res.tools.map((t) => t.name),
    ["read_file", "read_file_v2", "do_stuff", "clear_cache"],
  );
  assert.ok((res.serverInfo as { serverInfo?: { name?: string } }).serverInfo?.name === "demo-server");
});

test("probeServerBatch surfaces a clear error when the command cannot run", async () => {
  await assert.rejects(
    () => probeServerBatch({ command: "definitely-not-a-real-binary-xyz" }, 5_000, here),
    (e: Error) => e instanceof McpProbeError || /spawn|ENOENT/i.test(e.message),
  );
});
