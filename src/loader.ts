/**
 * Fixture loading.
 *
 * A fixture is a JSON file describing one MCP server's tool list. Two shapes
 * are accepted so that fixtures can be written by hand or captured verbatim
 * from a `tools/list` response:
 *
 *   { "server": "...", "source": "...", "tools": [...] }
 *   [ ...tools ]                        // server name comes from the filename
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { normalizeTool } from "./probe.ts";
import type { McpTool, ToolFixture } from "./types.ts";

export class FixtureError extends Error {
  readonly file?: string;

  constructor(message: string, file?: string) {
    super(message);
    this.name = "FixtureError";
    this.file = file;
  }
}

export function parseFixture(raw: unknown, filename: string): ToolFixture {
  const server = basename(filename, extname(filename));

  if (Array.isArray(raw)) {
    return { server, source: "fixture", tools: raw.map((t, i) => normalizeTool(t, i)) };
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const toolsRaw = o.tools;
    if (!Array.isArray(toolsRaw)) {
      throw new FixtureError("fixture object must contain a `tools` array", filename);
    }
    return {
      server: typeof o.server === "string" ? o.server : server,
      source: typeof o.source === "string" ? o.source : "fixture",
      tools: toolsRaw.map((t, i) => normalizeTool(t, i)),
    };
  }
  throw new FixtureError("fixture must be an object or an array", filename);
}

export function loadFixtureFile(path: string): ToolFixture {
  const abs = resolve(path);
  let text: string;
  try {
    text = readFileSync(abs, "utf8");
  } catch (e) {
    throw new FixtureError(`cannot read fixture: ${(e as Error).message}`, abs);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new FixtureError(`invalid JSON: ${(e as Error).message}`, abs);
  }
  return parseFixture(raw, abs);
}

/** Expand directories (recursively) into their *.json children; pass files through. */
export function collectFixturePaths(inputs: string[]): string[] {
  const out: string[] = [];
  for (const input of inputs) {
    const abs = resolve(input);
    let st;
    try {
      st = statSync(abs);
    } catch {
      throw new FixtureError(`path does not exist: ${input}`, abs);
    }
    if (st.isDirectory()) {
      walk(abs, out);
    } else {
      out.push(abs);
    }
  }
  return out.sort();
}

function walk(dir: string, out: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      walk(p, out);
    } else if (e.name.endsWith(".json") && !e.name.endsWith(".labels.json")) {
      out.push(p);
    }
  }
}

export function loadFixtures(inputs: string[]): ToolFixture[] {
  return collectFixturePaths(inputs).map(loadFixtureFile);
}

/** Serialize a live server's tools back to a fixture, for caching. */
export function fixtureFromTools(server: string, tools: McpTool[], source = "mcp"): ToolFixture {
  return { server, source, tools };
}
