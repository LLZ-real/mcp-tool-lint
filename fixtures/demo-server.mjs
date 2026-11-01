#!/usr/bin/env node
/**
 * A tiny MCP server used by the integration tests and the README demo.
 *
 * It speaks just enough of the protocol to answer `initialize` and
 * `tools/list`, and it deliberately advertises a mix of good and bad tool
 * definitions so the linter has something to find.
 *
 * Usage: node fixtures/demo-server.mjs
 */

const TOOLS = [
  {
    name: "read_file",
    description: "Read a file.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "read_file_v2",
    description: "Read a file.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "do_stuff",
    description: "Handles things.",
    inputSchema: {
      type: "object",
      properties: { data: {}, mode: { type: "string" } },
    },
  },
  {
    name: "clear_cache",
    description: "Delete every cached entry.",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {} },
  },
];

let buffer = "";

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    handle(msg);
  }
});

function handle(msg) {
  // Notifications have no id and must not be answered.
  if (msg.id === undefined || msg.id === null) return;

  switch (msg.method) {
    case "initialize":
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "demo-server", version: "0.0.1" },
        },
      });
      break;
    case "tools/list":
      send({ jsonrpc: "2.0", id: msg.id, result: { tools: TOOLS } });
      break;
    default:
      send({
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: -32601, message: `Method not found: ${msg.method}` },
      });
  }
}
