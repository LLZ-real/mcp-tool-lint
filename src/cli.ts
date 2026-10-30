#!/usr/bin/env node
/**
 * CLI entry point.
 *
 * Exit codes (stable, documented in README):
 *   0  no errors
 *   1  lint errors found
 *   2  usage / IO error
 */

import { existsSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { loadFixtures, type FixtureError } from "./loader.ts";
import { probeServer, type McpProbeError } from "./probe.ts";
import { buildReport, renderRuleCatalogue, VERSION } from "./report-builder.ts";
import { renderJson, renderMarkdown, renderTerminal } from "./report.ts";
import type { ToolFixture } from "./types.ts";

const HELP = `
  mcp-tool-lint — lint MCP tool definitions for LLM-callability

  Usage
    mcp-tool-lint <paths...>            lint fixture files or directories
    mcp-tool-lint --mcp "<command>"     probe a live MCP server over stdio
    mcp-tool-lint rules                 list every rule and why it exists
    mcp-tool-lint explain <rule-id>     detailed explanation of one rule

  Options
    --format <terminal|json|md>   output format            (default: terminal)
    --out <file>                  write report to a file
    --verbose                     show every finding
    --max <n>                     findings per tool         (default: 3)
    --fail-under <score>          exit 1 if average < n     (default: 0)
    --no-color                    disable ANSI colors
    --transport <auto|pipe|batch> MCP transport             (default: auto)
    --timeout <ms>                MCP handshake timeout     (default: 20000)
    --save-fixture <file>         with --mcp, dump the schema for reuse
    --version                     print version
    --help                        print this message

  Examples
    mcp-tool-lint fixtures/
    mcp-tool-lint --mcp "npx -y @modelcontextprotocol/server-filesystem ."
    mcp-tool-lint fixtures/ --format md --out REPORT.md
    mcp-tool-lint --mcp "node my-server.js" --save-fixture fixtures/mine.json

  Exit codes: 0 clean · 1 lint errors · 2 usage error
`;

interface Parsed {
  paths: string[];
  format: "terminal" | "json" | "md";
  out?: string;
  verbose: boolean;
  max: number;
  failUnder: number;
  color: boolean;
  transport: "auto" | "pipe" | "batch";
  timeout: number;
  mcp?: string;
  saveFixture?: string;
  command?: string;
  commandArg?: string;
  version: boolean;
  help: boolean;
}

function parse(argv: string[]): Parsed {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      format: { type: "string", default: "terminal" },
      out: { type: "string" },
      verbose: { type: "boolean", default: false },
      max: { type: "string", default: "3" },
      "fail-under": { type: "string", default: "0" },
      "no-color": { type: "boolean", default: false },
      transport: { type: "string", default: "auto" },
      timeout: { type: "string", default: "20000" },
      mcp: { type: "string" },
      "save-fixture": { type: "string" },
      version: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  const format = String(values.format);
  if (format !== "terminal" && format !== "json" && format !== "md") {
    throw new UsageError(`--format must be terminal, json, or md (got "${format}")`);
  }
  const transport = String(values.transport);
  if (transport !== "auto" && transport !== "pipe" && transport !== "batch") {
    throw new UsageError(`--transport must be auto, pipe, or batch (got "${transport}")`);
  }

  return {
    paths: positionals,
    format,
    out: values.out as string | undefined,
    verbose: Boolean(values.verbose),
    max: toInt(values.max as string, "--max"),
    failUnder: Number(values["fail-under"]),
    color: !values["no-color"] && process.stdout.isTTY !== false,
    transport,
    timeout: toInt(values.timeout as string, "--timeout"),
    mcp: values.mcp as string | undefined,
    saveFixture: values["save-fixture"] as string | undefined,
    command: positionals[0],
    commandArg: positionals[1],
    version: Boolean(values.version),
    help: Boolean(values.help),
  };
}

function toInt(s: string, flag: string): number {
  const n = Number.parseInt(s, 10);
  if (Number.isNaN(n) || n < 0) throw new UsageError(`${flag} must be a non-negative integer`);
  return n;
}

class UsageError extends Error {}

/** Split `--mcp "cmd arg1 arg2"` into a command + args. */
export function splitCommand(input: string): { command: string; args: string[] } {
  const parts: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (const ch of input.trim()) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (cur) {
        parts.push(cur);
        cur = "";
      }
    } else {
      cur += ch;
    }
  }
  if (cur) parts.push(cur);
  if (parts.length === 0) throw new UsageError("--mcp needs a command");
  return { command: parts[0]!, args: parts.slice(1) };
}

async function main(): Promise<number> {
  let args: Parsed;
  try {
    args = parse(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`error: ${(e as Error).message}\n${HELP}`);
    return 2;
  }

  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (args.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  if (args.command === "rules") {
    process.stdout.write(renderRuleCatalogue() + "\n");
    return 0;
  }

  if (args.command === "explain") {
    const id = args.commandArg;
    if (!id) {
      process.stderr.write("error: explain needs a rule id (see `mcp-tool-lint rules`)\n");
      return 2;
    }
    const { RULES } = await import("./rules.ts");
    const rule = RULES.find((r) => r.id === id);
    if (!rule) {
      process.stderr.write(`error: unknown rule "${id}"\n`);
      return 2;
    }
    process.stdout.write(
      `\n  ${rule.id}\n  ${rule.dimension} · ${rule.severity} · -${rule.penalty} points\n\n  ${rule.summary}\n\n  Why it matters\n  ${rule.rationale}\n\n`,
    );
    return 0;
  }

  // ── gather fixtures ────────────────────────────────────────────────
  let fixtures: ToolFixture[] = [];

  if (args.mcp) {
    const { command, args: cmdArgs } = splitCommand(args.mcp);
    process.stderr.write(`probing MCP server: ${command} ${cmdArgs.join(" ")}\n`);
    try {
      const res = await probeServer(
        { command, args: cmdArgs },
        {
          transport: args.transport,
          timeoutMs: args.timeout,
          // Keep scratch files inside the caller's workspace: sandboxes often
          // deny writes to the system temp directory.
          workDir: process.cwd(),
        },
      );
      process.stderr.write(`ok: ${res.tools.length} tools via ${res.transport} transport\n`);
      const name = command.split(/[\\/]/).pop() ?? "server";
      fixtures.push({ server: name, source: `mcp:${res.transport}`, tools: res.tools });
      if (args.saveFixture) {
        writeFileSync(
          args.saveFixture,
          JSON.stringify({ server: name, source: "mcp", tools: res.tools }, null, 2) + "\n",
          "utf8",
        );
        process.stderr.write(`saved fixture: ${args.saveFixture}\n`);
      }
    } catch (e) {
      process.stderr.write(`error: ${(e as Error).message}\n`);
      return 2;
    }
  } else {
    if (args.paths.length === 0) {
      process.stderr.write(`error: no input. Pass a fixture path or --mcp "<command>".\n${HELP}`);
      return 2;
    }
    for (const p of args.paths) {
      if (!existsSync(p)) {
        process.stderr.write(`error: path does not exist: ${p}\n`);
        return 2;
      }
    }
    try {
      fixtures = loadFixtures(args.paths);
    } catch (e) {
      const fe = e as FixtureError;
      process.stderr.write(`error: ${fe.message}${fe.file ? ` (${fe.file})` : ""}\n`);
      return 2;
    }
  }

  if (fixtures.length === 0) {
    process.stderr.write("error: no tools found in the given input\n");
    return 2;
  }

  const report = buildReport(fixtures);

  let text: string;
  switch (args.format) {
    case "json":
      text = renderJson(report);
      break;
    case "md":
      text = renderMarkdown(report);
      break;
    default:
      text = renderTerminal(report, {
        color: args.color,
        verbose: args.verbose,
        maxFindingsPerTool: args.max,
      });
  }

  if (args.out) {
    writeFileSync(args.out, text.endsWith("\n") ? text : text + "\n", "utf8");
    process.stderr.write(`report written to ${args.out}\n`);
  } else {
    process.stdout.write(text.endsWith("\n") ? text : text + "\n");
  }

  if (report.summary.errors > 0) return 1;
  if (args.failUnder > 0 && report.summary.averageScore < args.failUnder) {
    process.stderr.write(
      `error: average score ${report.summary.averageScore} is below --fail-under ${args.failUnder}\n`,
    );
    return 1;
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    process.stderr.write(`fatal: ${(e as Error).stack ?? String(e)}\n`);
    process.exit(2);
  },
);
