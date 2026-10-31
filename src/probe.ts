/**
 * Minimal MCP stdio client.
 *
 * We only need `initialize` + `tools/list`, so this is deliberately not a
 * general-purpose SDK: no sampling, no resources, no notifications beyond
 * what the handshake requires. The value here is that linting can run
 * against the *live* server rather than a copy-pasted schema.
 *
 * Two transports ship:
 *   - pipe:  normal operation, talks JSON-RPC over stdin/stdout.
 *   - batch: writes the whole request sequence to a file and replays the
 *            response file afterwards. Used for hermetic CI and for
 *            sandboxes that forbid opening pipes to child processes.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JSONSchema, McpTool } from "./types.ts";

export interface ServerCommand {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * Windows needs `shell: true` to launch `.cmd`/`.bat` shims (npx, pnpm, uv),
 * but combining it with an args array is deprecated and escapes poorly.
 * So on Windows we build one command line — and every token that contains a
 * space must be quoted, or `C:\Program Files\nodejs\node.exe` gets split at
 * the first space. (A real bug this project's own test suite caught.)
 */
function quoteWin(token: string): string {
  if (!/\s/.test(token)) return token;
  return `"${token.replace(/"/g, '\\"')}"`;
}

function spawnOptions(cmd: ServerCommand) {
  const base = {
    cwd: cmd.cwd,
    env: { ...process.env, ...(cmd.env ?? {}) },
  };
  if (process.platform === "win32") {
    const line = [cmd.command, ...(cmd.args ?? [])].map(quoteWin).join(" ");
    return { file: line, args: [] as string[], opts: { ...base, shell: true as const } };
  }
  return {
    file: cmd.command,
    args: cmd.args ?? [],
    opts: { ...base, shell: false as const },
  };
}
const CLIENT_INFO = { name: "mcp-tool-lint", version: "0.1.0" };
const PROTOCOL_VERSION = "2025-06-18";

export class McpProbeError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "McpProbeError";
    this.cause = cause;
  }
}

/** Extract tools from a `tools/list` result, tolerating spec drift. */
export function parseToolsList(result: unknown): McpTool[] {
  if (!result || typeof result !== "object") {
    throw new McpProbeError("tools/list returned a non-object result");
  }
  const tools = (result as { tools?: unknown }).tools;
  if (!Array.isArray(tools)) {
    throw new McpProbeError("tools/list result has no `tools` array");
  }
  return tools.map((t, i) => normalizeTool(t, i));
}

export function normalizeTool(raw: unknown, index: number): McpTool {
  if (!raw || typeof raw !== "object") {
    throw new McpProbeError(`tool #${index} is not an object`);
  }
  const t = raw as Record<string, unknown>;
  const name = typeof t.name === "string" ? t.name : `tool_${index}`;
  const tool: McpTool = { name };
  if (typeof t.description === "string") tool.description = t.description;
  if (t.inputSchema && typeof t.inputSchema === "object") {
    tool.inputSchema = t.inputSchema as JSONSchema;
  }
  if (t.outputSchema && typeof t.outputSchema === "object") {
    tool.outputSchema = t.outputSchema as JSONSchema;
  }
  if (t.annotations && typeof t.annotations === "object") {
    tool.annotations = t.annotations as McpTool["annotations"];
  }
  return tool;
}

// ───────────────────────────── pipe transport ─────────────────────────────

export async function probeServerPipe(
  cmd: ServerCommand,
  timeoutMs = 20_000,
): Promise<{ tools: McpTool[]; serverInfo: unknown }> {
  const sp = spawnOptions(cmd);
  const child = spawn(sp.file, sp.args, { ...sp.opts, stdio: ["pipe", "pipe", "pipe"] });

  let buf = "";
  let stderr = "";
  const pending = new Map<number, (r: JsonRpcResponse) => void>();
  let nextId = 1;
  let closed = false;

  const fail = (err: Error) => {
    for (const [, reject] of pending) void reject;
    pending.clear();
    void err;
  };

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg: JsonRpcResponse;
      try {
        msg = JSON.parse(line) as JsonRpcResponse;
      } catch {
        continue; // servers sometimes log non-JSON to stdout; ignore it
      }
      const id = typeof msg.id === "number" ? msg.id : Number(msg.id);
      const resolve = pending.get(id);
      if (resolve) {
        pending.delete(id);
        resolve(msg);
      }
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (c: string) => {
    stderr += c;
  });

  const onClose = new Promise<void>((resolve) => child.on("close", () => resolve()));
  child.on("error", (e: Error) => {
    closed = true;
    fail(e);
  });

  const request = (method: string, params?: unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      if (closed) return reject(new McpProbeError("server process is not running"));
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new McpProbeError(`timeout after ${timeoutMs}ms waiting for ${method}`));
      }, timeoutMs);

      pending.set(id, (msg) => {
        clearTimeout(timer);
        if (msg.error) {
          reject(new McpProbeError(`${method} failed: ${msg.error.message} (code ${msg.error.code})`));
        } else {
          resolve(msg.result);
        }
      });

      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });

  const notify = (method: string, params?: unknown) => {
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  };

  try {
    const init = await request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO,
    });
    notify("notifications/initialized");
    const list = await request("tools/list", {});
    return { tools: parseToolsList(list), serverInfo: init };
  } catch (e) {
    const hint =
      stderr.trim().length > 0
        ? `\n--- server stderr ---\n${stderr.trim().slice(0, 2000)}`
        : "";
    if ((e as NodeJS.ErrnoException).code === "EPERM") {
      throw new McpProbeError(
        "cannot spawn the server: the sandbox forbids opening pipes to child processes.\n" +
          "Run the probe outside the sandbox, or use --probe-batch.",
        e,
      );
    }
    throw e instanceof McpProbeError ? new McpProbeError(e.message + hint, e.cause) : new McpProbeError(String(e) + hint, e);
  } finally {
    child.stdin.end();
    setTimeout(() => child.kill(), 250).unref?.();
    await Promise.race([onClose, new Promise((r) => setTimeout(r, 1000))]);
  }
}

// ───────────────────────────── batch transport ────────────────────────────

/**
 * Send a fixed request sequence by redirecting the child's stdin/stdout to
 * files. No pipes are opened, so this works where `pipe` is blocked.
 *
 * Trade-off: we cannot react to a response mid-flight, so the sequence is
 * fixed and the server must process requests in order (every MCP server we
 * have seen does; JSON-RPC over a stream is inherently ordered).
 *
 * `workDir` lets callers keep the scratch files inside their own workspace,
 * which matters in sandboxes that deny access to the system temp directory.
 */
export async function probeServerBatch(
  cmd: ServerCommand,
  timeoutMs = 20_000,
  workDir?: string,
): Promise<{ tools: McpTool[]; serverInfo: unknown }> {
  const dir = mkdtempSync(join(workDir ?? tmpdir(), "mcplint-"));
  const inPath = join(dir, "in.jsonl");
  const outPath = join(dir, "out.jsonl");
  const errPath = join(dir, "err.txt");

  const requests = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO },
    },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  ];
  writeFileSync(inPath, requests.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");

  const fin = openSync(inPath, "r");
  const fout = openSync(outPath, "w");
  const ferr = openSync(errPath, "w");

  try {
    await new Promise<void>((resolve, reject) => {
      const sp = spawnOptions(cmd);
      const child = spawn(sp.file, sp.args, { ...sp.opts, stdio: [fin, fout, ferr] });
      const timer = setTimeout(() => {
        child.kill();
        reject(new McpProbeError(`timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(new McpProbeError(`failed to spawn: ${e.message}`, e));
      });
      child.on("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });

    const out = readFileSync(outPath, "utf8");
    const responses = new Map<number, JsonRpcResponse>();
    for (const line of out.split("\n")) {
      const s = line.trim();
      if (!s) continue;
      try {
        const msg = JSON.parse(s) as JsonRpcResponse;
        if (msg.id !== undefined && msg.id !== null) responses.set(Number(msg.id), msg);
      } catch {
        /* ignore non-JSON noise */
      }
    }

    const init = responses.get(1);
    if (!init) {
      const err = safeRead(errPath);
      throw new McpProbeError(`no response to initialize${err ? `\n--- server stderr ---\n${err}` : ""}`);
    }
    if (init.error) throw new McpProbeError(`initialize failed: ${init.error.message}`);

    const list = responses.get(2);
    if (!list) throw new McpProbeError("no response to tools/list");
    if (list.error) throw new McpProbeError(`tools/list failed: ${list.error.message}`);

    return { tools: parseToolsList(list.result), serverInfo: init.result };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function safeRead(p: string): string {
  try {
    return readFileSync(p, "utf8").trim().slice(0, 2000);
  } catch {
    return "";
  }
}

/** Probe with automatic transport selection. */
export async function probeServer(
  cmd: ServerCommand,
  opts: { transport?: "auto" | "pipe" | "batch"; timeoutMs?: number; workDir?: string } = {},
): Promise<{ tools: McpTool[]; serverInfo: unknown; transport: "pipe" | "batch" }> {
  const transport = opts.transport ?? "auto";
  const timeoutMs = opts.timeoutMs ?? 20_000;

  if (transport === "batch") {
    const r = await probeServerBatch(cmd, timeoutMs, opts.workDir);
    return { ...r, transport: "batch" };
  }
  if (transport === "pipe") {
    const r = await probeServerPipe(cmd, timeoutMs);
    return { ...r, transport: "pipe" };
  }
  try {
    const r = await probeServerPipe(cmd, timeoutMs);
    return { ...r, transport: "pipe" };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    const msg = e instanceof Error ? e.message : String(e);
    if (code === "EPERM" || /EPERM|forbids opening pipes/.test(msg)) {
      const r = await probeServerBatch(cmd, timeoutMs, opts.workDir);
      return { ...r, transport: "batch" };
    }
    throw e;
  }
}
