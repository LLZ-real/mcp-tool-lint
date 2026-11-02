# mcp-tool-lint

**Lint your MCP tool definitions for LLM-callability — then measure the improvement with a benchmark.**

Your MCP server compiles. The schema is valid JSON Schema. The model still calls the wrong tool, or passes a string where it wanted an object.

`mcp-tool-lint` scores each tool 0–100 across five dimensions that map to *how an LLM actually fails*, tells you the specific fix, and ships a paired fixture set so the improvement is measurable rather than vibes.

Two runs over the same API, before and after (verbatim output from each command, `--no-color`, colors stripped — the only edit is the marked `…` elision in the first block):

```
$ mcp-tool-lint fixtures/raw/filesystem.json

  mcp-tool-lint  v0.1.0
  7 tools across 1 server(s)

  filesystem-raw  (fixture:baseline)  38.4 / 100  F

     19.0  read_file                     ██░░░░░░░░░░  F
          error  desc/too-short             Description is only 12 chars ("Read a file.") — too short to distinguish from sibling tools.
                                           ↳ Expand to at least one sentence: what it does + what it returns.
          error  ambiguity/name-collision   `read_file` and `read_file_v2` are 75% confusable — same verb, overlapping object.
                                           ↳ Rename one to reflect the distinguishing dimension (scope, target, format), or merge them behind a `mode` enum.
          warn   desc/params-undocumented   None of the required params (path) appear in the description.
                                           ↳ Mention `path` in the description, or give it a `description` in the schema.
          ... 5 more (use --verbose)
     19.0  read_file_v2                  ██░░░░░░░░░░  F
          error  desc/too-short             Description is only 12 chars ("Read a file.") — too short to distinguish from sibling tools.
                                           ↳ Expand to at least one sentence: what it does + what it returns.
          error  ambiguity/name-collision   `read_file_v2` and `read_file` are 75% confusable — same verb, overlapping object.
                                           ↳ Rename one to reflect the distinguishing dimension (scope, target, format), or merge them behind a `mode` enum.
          warn   desc/params-undocumented   None of the required params (path) appear in the description.
                                           ↳ Mention `path` in the description, or give it a `description` in the schema.
          ... 5 more (use --verbose)
    … (5 more tools elided — run the command for the full output) …
```

The same API after the fixes the findings above recommend — `read_file`/`read_file_v2` merged into one tool with an `encoding` enum:

```
$ mcp-tool-lint fixtures/polished/filesystem.json

  mcp-tool-lint  v0.1.0
  6 tools across 1 server(s)

  filesystem  (fixture:polished)  99.3 / 100  A

    100.0  read_file                     ████████████  A  clean
    100.0  write_text_file               ████████████  A  clean
     96.0  delete_path                   ████████████  A
          info   desc/no-return             Description never states what the tool returns.
                                           ↳ Append a returns clause, e.g. "Returns the file contents as a UTF-8 string."
    100.0  list_directory                ████████████  A  clean
    100.0  search_files                  ████████████  A  clean
    100.0  stat_path                     ████████████  A  clean
```

Each block is one run over one file. The first block shows 2 of the raw server's 7 tools (the rest are marked `…`); after the tool list, both runs continue with the dimension summary and the rule-frequency table — run the commands for the full output. Nothing is stitched together from different runs.

## Why this exists

MCP servers are easy to write and hard to write *well*. The failure is never a crash — it's a model that:

- picks `read_file` when it needed `read_file_v2`
- passes `"recursive"` to a boolean flag that expected `true`
- invents a `mode` value because the schema only said `type: string`
- calls a destructive tool without asking, because nobody set `destructiveHint`

None of these are schema-validation errors. All of them are *describing* errors. Existing MCP tooling validates structure; almost nothing measures whether a model can **route** to the right tool and **fill** it correctly.

## The benchmark

The claim "this linter works" is only worth something if it separates good from bad. So the repo ships three API pairs — the same API written twice, once as people actually write it, once fixed. The fixed side merges tools where merging is the honest fix (`read_file`/`read_file_v2` → one `read_file` with an `encoding` enum), so the tool counts differ; that is the point.

| API | Raw | Grade | Polished | Grade | Gap |
|---|---:|---:|---:|---:|--:|
| filesystem | 38.4 | F | 99.3 | A | **+60.9** |
| web-fetch | 28.5 | F | 100.0 | A | **+71.5** |
| database | 46.8 | F | 92.0 | A | **+45.2** |
| **mean** | **37.9** | F | **97.1** | A | **+59.2** |

Reproduce with (also available as `npm run bench`; writes `benchmark/summary.json`):

```bash
node --experimental-strip-types benchmark/run.ts
```

The harness asserts invariants — `polished > raw` for every pair, `polished >= 70`, `raw <= 60`, and **zero error-level findings in the polished set** — and exits non-zero if any break, so it works as a CI gate. Warning/info findings in the polished fixtures are kept on purpose: they are the next improvement, not a defect.

### What changed between raw and polished

Every raw tool maps to a polished one, so "the same API, written twice" is checkable tool by tool. Three moves are used: **merge** (two names for one capability), **rename** (make the verb/object carry the semantics), and **mode enum** (fold a family of near-duplicate tools into one).

**filesystem** (7 → 6)

| raw | polished | move |
|---|---|---|
| `read_file`, `read_file_v2` | `read_file` | merge behind an `encoding: "utf8" \| "base64"` enum |
| `write` | `write_text_file` | rename + document every param |
| `delete` | `delete_path` | rename + `destructiveHint: true` |
| `ls` | `list_directory` | rename |
| `file_info` | `stat_path` | rename |
| `handle` | — (dissolved) | god-tool with a catch-all `data`/`mode`; replaced by focused tools |
| — | `search_files` | the focused search tool that `handle`'s scope used to swallow |

**web-fetch** (4 → 3)

| raw | polished | move |
|---|---|---|
| `get`, `get_url` | `fetch_url` | merge; two vague names for one capability → one verb+object |
| `process` | split → `fetch_url` + `fetch_binary` | god-tool with 11 params folded into the two focused tools (its `raw` flag became `fetch_binary`) |
| `reset` | `clear_http_cache` | rename + `destructiveHint: true` |

**database** (6 → 6)

| raw | polished | move |
|---|---|---|
| `query` | `run_select_query` | rename + narrowed to read-only SELECT |
| `exec` | `run_write_query` | rename + narrowed to DML with bound params |
| `drop_table` | `migrate_schema` | mode enum (`create`/`drop`/`alter`) + `destructiveHint: true` |
| `get_table` | `describe_table` | rename |
| `list_tables` | `list_tables` | documented; optional params made explicit |
| `list_views` | `list_views` | documented |

**What this benchmark does *not* prove:** that a higher score means a higher model call-success rate. The scoring model is a hypothesis about LLM behaviour, calibrated by hand against the fixtures — not by measuring a model. See [DESIGN.md](DESIGN.md#what-is-not-proven).

## Install & run

The package is scoped, `@llz-real/mcp-tool-lint`, because the unscoped npm name `mcp-tool-lint` belongs to an unrelated project. Use the scoped name with npx; the installed binary is still called `mcp-tool-lint`.

> **Not published to npm yet.** Until `npm publish` runs, build from source (below). The `npx` commands here and the GitHub Action snippet work after publishing.

```bash
# after publishing: the package runs its compiled dist/cli.js — nothing to build on your side
npx @llz-real/mcp-tool-lint fixtures/

# against a live server, over real MCP stdio
npx @llz-real/mcp-tool-lint --mcp "npx -y @modelcontextprotocol/server-filesystem ."

# cache the schema so CI does not need to spawn anything
npx @llz-real/mcp-tool-lint --mcp "node my-server.js" --save-fixture fixtures/mine.json
```

From source:

```bash
npm install
npm run build            # tsc -> dist/
node dist/cli.js fixtures/

# or skip the build and run the TypeScript directly (Node 22.6+ type stripping)
node --experimental-strip-types src/cli.ts fixtures/
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

### GitHub Action (after publishing)

```yaml
- run: npx @llz-real/mcp-tool-lint fixtures/ --fail-under 80
```

## Library use

```ts
import { lint, scoreTool, RULES } from "@llz-real/mcp-tool-lint";

const report = lint(myTools, "my-server");
console.log(report.averageScore);        // e.g. 92.0 for fixtures/polished/database.json
console.log(report.tools[0].findings);   // typed, with fixes
```

## The interesting part: what "confusable" means

The obvious way to detect colliding tool names is string similarity. On easy pairs it even ranks them correctly:

```
read_text_file / read_file_bytes   trigrams 0.44   ← a model WILL confuse these
list_tables    / list_views        trigrams 0.38   ← nobody confuses these
```

But the two pairs sit 0.06 apart — no threshold tells "confusable" from "fine" on the next example — and the metric measures **spelling**, which is not what a model reasons about. Token overlap is worse: `delete_path` / `delete_file` (confusable) and `list_tables` / `list_views` (distinct) both score 0.33. What actually causes misselection is **same verb, near-synonym object**: the model knows it must read something, and both tools are readers.

So `confusability()` keys on the leading verb plus a small synonym table (`path`≈`file`≈`dir`, `url`≈`uri`≈`link`), not on spelling. The one refinement: when two names share only a head noun and the differing words are action verbs, the modifier carries the semantics and the pair is separable. Every number below is produced by `confusability()` in `src/text.ts`:

| Pair | Score | Verdict |
|---|---:|---|
| `read_text_file` / `read_file_bytes` | 0.75 | confusable — `text`/`bytes` are format nouns, they do not separate the pair |
| `delete_path` / `delete_file` | 0.75 | confusable — `path`≈`file`, same target |
| `read_file` / `read_file_v2` | 0.75 | confusable — `v2` is a version suffix, not an object word |
| `run_select_query` / `run_write_query` | 0.50 | fine — the modifiers `select`/`write` are verbs and name the operation |
| `list_tables` / `list_views` | 0.50 | fine — distinct entities |
| `read_file` / `write_file` | 0.26 | fine — different verb |

Near-identical spellings skip the analysis entirely: `read_file` vs `readFile` measures 1.00 (trigram shortcut). A collision finding is reported on **both** tools of a pair — both are risky routes.

The synonym table is deliberately small. `table` and `view` are *not* synonyms; grouping them was an early bug — the test suite now pins both directions (`delete_path`/`delete_file` confusable, `list_tables`/`list_views` not).

## Where it falls short

Being explicit about limits, because a linter that cries wolf gets uninstalled:

- **Heuristics, not a model.** Rules are lexical. A cleverly-worded description can pass while still being ambiguous to a real LLM, and a terse-but-conventional one can be flagged.
- **English-centric.** The verb list, usage cues, and synonym table are English. Non-English descriptions will mostly hit only the structural rules.
- **No semantic check.** It never verifies that a description *matches* what the tool does — only that a description exists and looks routable.
- **Score is a hypothesis.** The weights and caps are hand-tuned against the fixtures. They encode a judgement about which failures matter, not a measured model failure rate.
- **`desc/no-usage-cue` needs a sibling to be close.** On small servers (< 4 tools) it never fires, by design.
- **Compound nouns are only half-solved.** Verb modifiers (`select`/`write`) separate a pair; format nouns (`text`/`bytes`, `json`/`csv`) do not — those pairs stay flagged and the fix is renaming or merging.

## Repo layout

```
src/
  types.ts           data model: MCP tool shape, findings, report
  text.ts            lexical primitives + confusability metric
  rules.ts           24 rules, each with a rationale
  score.ts           additive scoring + caps
  report.ts          terminal / JSON / Markdown renderers
  report-builder.ts  report assembly + rule catalogue
  probe.ts           MCP stdio client (pipe + batch transports)
  loader.ts          fixture loading
  index.ts           library surface
  cli.ts             entry point
fixtures/
  raw/               how people actually write servers
  polished/          the same APIs, fixed
  demo-server.mjs    a tiny MCP server for integration tests
test/                45 tests
benchmark/           paired-fixture harness + summary.json
```

## Development

```bash
npm run build      # tsc
npm test           # runs test/ in a single process (works where spawning is restricted)
npm run bench      # paired-fixture benchmark -> benchmark/summary.json
```

## License

MIT
