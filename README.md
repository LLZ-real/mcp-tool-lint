# mcp-tool-lint

**Lint your MCP tool definitions for LLM-callability — then prove the fix with a benchmark.**

Your MCP server compiles. The schema is valid JSON Schema. The model still calls the wrong tool, or passes a string where it wanted an object.

`mcp-tool-lint` scores each tool 0–100 across five dimensions that map to *how an LLM actually fails*, tells you the specific fix, and ships a paired fixture set so the improvement is measurable rather than vibes.

```
$ mcp-tool-lint fixtures/

  filesystem  (fixture:polished)  90.9 / 100  A

     19.0  read_file                     ██░░░░░░░░░░  F
          error  desc/too-short             Description is only 12 chars ("Read a file.") — too short to distinguish from sibling tools.
                                           ↳ Expand to at least one sentence: what it does + what it returns.
          error  ambiguity/name-collision   `read_file` and `read_file_v2` are 75% confusable — same verb, overlapping object.
                                           ↳ Rename one to reflect the distinguishing dimension (scope, target, format), or merge them behind a `mode` enum.
          warn   desc/params-undocumented   None of the required params (path) appear in the description.
                                           ↳ Either mention them, e.g. "path is the absolute path to read.", or give each one a `description` in the schema.
```

## Why this exists

MCP servers are easy to write and hard to write *well*. The failure is never a crash — it's a model that:

- picks `read_file` when it needed `read_file_v2`
- passes `"recursive"` to a boolean flag that expected `true`
- invents a `mode` value because the schema only said `type: string`
- calls a destructive tool without asking, because nobody set `destructiveHint`

None of these are schema-validation errors. All of them are *describing* errors. Existing MCP tooling validates structure; almost nothing measures whether a model can **route** to the right tool and **fill** it correctly.

## The benchmark

The claim "this linter works" is only worth something if it separates good from bad. So the repo ships three API pairs — the same server written twice, once as people actually write it, once fixed:

| API | Raw | Grade | Polished | Grade | Gap |
|---|---:|---:|---:|---:|--:|
| filesystem | 41.3 | F | 90.9 | A | **+49.6** |
| web-fetch | 26.5 | F | 78.0 | C | **+51.5** |
| database | 45.5 | F | 80.4 | B | **+34.9** |
| **mean** | **37.8** | F | **83.1** | A | **+45.3** |

Reproduce with:

```bash
node --experimental-strip-types benchmark/run.ts
```

The harness asserts invariants (`polished > raw` for every pair, `polished >= 70`, `raw <= 60`) and exits non-zero if any break, so it works as a CI gate.

**What this benchmark does *not* prove:** that a higher score means a higher model call-success rate. The scoring model is a hypothesis about LLM behaviour, calibrated by hand against the fixtures — not by measuring a model. See [DESIGN.md](DESIGN.md#what-is-not-proven).

## Install & run

```bash
# no build step; Node 22.6+ runs the TypeScript directly
npx mcp-tool-lint fixtures/

# against a live server, over real MCP stdio
npx mcp-tool-lint --mcp "npx -y @modelcontextprotocol/server-filesystem ."

# cache the schema so CI does not need to spawn anything
npx mcp-tool-lint --mcp "node my-server.js" --save-fixture fixtures/mine.json
```

From source:

```bash
npm install
npm run build
node dist/cli.js fixtures/
```

## The five dimensions

Scores are **additive deductions** from 100, capped at 55 per dimension, so a single pathological dimension cannot zero a tool on its own. Critical rules (`desc/missing`, `schema/missing`, `ambiguity/name-collision`, `safety/readonly-misdeclared`) impose a hard ceiling of 40.

| Dimension | What it catches | Example rule |
|---|---|---|
| **describing** | The prose the model routes on | `desc/too-short`, `desc/no-usage-cue` |
| **schema** | Whether the args are guessable | `schema/untyped-param`, `schema/unbounded-string` |
| **ambiguity** | Whether two tools look alike | `ambiguity/name-collision`, `ambiguity/vague-verb` |
| **safety** | Whether risk is declared | `safety/destructive-undeclared`, `safety/readonly-misdeclared` |
| **ergonomics** | Whether the call shape is sane | `ergonomics/god-tool`, `ergonomics/boolean-trap` |

24 rules total. List them all with rationale:

```bash
mcp-tool-lint rules
mcp-tool-lint explain ambiguity/name-collision
```

## Output formats

```bash
mcp-tool-lint fixtures/                          # terminal, colored
mcp-tool-lint fixtures/ --format json            # machine-readable
mcp-tool-lint fixtures/ --format md --out R.md   # PR comments
mcp-tool-lint fixtures/ --fail-under 80          # CI gate
mcp-tool-lint fixtures/ --verbose                # every finding
```

Exit codes: `0` clean · `1` lint errors (or below `--fail-under`) · `2` usage error.

### GitHub Action

```yaml
- run: npx mcp-tool-lint fixtures/ --fail-under 80
```

## Library use

```ts
import { lint, scoreTool, RULES } from "mcp-tool-lint";

const report = lint(myTools, "my-server");
console.log(report.averageScore);        // 83.1
console.log(report.tools[0].findings);   // typed, with fixes
```

## The interesting part: what "confusable" means

The obvious way to detect colliding tool names is string similarity. It does not work.

```
read_text_file / read_file_bytes   trigrams 0.44   ← a model WILL confuse these
read_file      / write_file        trigrams 0.32   ← nobody confuses these
```

Character overlap is the wrong signal. What actually causes misselection is **same verb, near-synonym object**: the model knows it must read something, and both tools are readers.

So `confusability()` keys on the leading verb plus a small synonym table (`path`≈`file`≈`dir`, `url`≈`uri`≈`link`), not on spelling:

| Pair | Score | Verdict |
|---|---:|---|
| `read_text_file` / `read_file_bytes` | 0.67 | confusable |
| `delete_path` / `delete_file` | 0.75 | confusable |
| `read_file` / `read_file_v2` | 0.75 | confusable |
| `list_tables` / `list_views` | 0.50 | distinct entities — fine |
| `read_file` / `write_file` | 0.26 | different verb — fine |

The synonym table is deliberately small. `table` and `view` are *not* synonyms; treating them as one class was a bug that this project shipped for about ten minutes before the test suite caught it.

## Where it falls short

Being explicit about limits, because a linter that cries wolf gets uninstalled:

- **Heuristics, not a model.** Rules are lexical. A cleverly-worded description can pass while still being ambiguous to a real LLM, and a terse-but-conventional one can be flagged.
- **English-centric.** The verb list, usage cues, and synonym table are English. Non-English descriptions will mostly hit only the structural rules.
- **No semantic check.** It never verifies that a description *matches* what the tool does — only that a description exists and looks routable.
- **Score is a hypothesis.** The weights and caps are hand-tuned against the fixtures. They encode a judgement about which failures matter, not a measured model failure rate.
- **`desc/no-usage-cue` needs a sibling to be close.** On small servers (< 4 tools) it never fires, by design.

## Repo layout

```
src/
  text.ts            lexical primitives + confusability metric
  rules.ts           24 rules, each with a rationale
  score.ts           additive scoring + caps
  report.ts          terminal / JSON / Markdown renderers
  probe.ts           MCP stdio client (pipe + batch transports)
  loader.ts          fixture loading
  cli.ts             entry point
fixtures/
  raw/               how people actually write servers
  polished/          the same APIs, fixed
  demo-server.mjs    a tiny MCP server for integration tests
test/                41 tests
benchmark/           paired-fixture harness + results
```

## Development

```bash
npm run build      # tsc
npm test           # node --test
npm run bench      # build + paired-fixture benchmark
```

## License

MIT
