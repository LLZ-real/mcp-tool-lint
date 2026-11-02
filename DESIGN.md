# Design notes

Decisions that were not obvious, and the alternatives that lost.

---

## 1. Why "callability" instead of schema validity

`jsonschema` validators already exist and are better at structural correctness than anything here would be. The gap is a level up: a schema can be perfectly valid and still unusable by a model, because the model has to *choose* among tools and *invent* argument values from prose.

So every rule answers one question: **does this make a model more or less likely to call the right tool with the right arguments?** Rules that only police style were cut. Two were cut during development:

- *"description should end with a period"* — no effect on routing.
- *"tool names should be under 30 chars"* — no effect on routing; several real servers have long, clear names.

---

## 2. Scoring: additive deductions, not weighted averages

The first implementation scored each dimension 0–100, then took a weighted mean (the weights survive in `DIMENSION_WEIGHTS`, used only for reporting). It was too forgiving. Take `read_file` with the one-line description `"Read a file."` and a single typed `path` parameter, measured with the current rule set:

| | describing | schema | ambiguity | safety | ergonomics | additive total | weighted mean |
|---|---:|---:|---:|---:|---:|---:|---:|
| `read_file` with `"Read a file."` | 61 | 91 | 100 | 95 | 100 | **47 / F** | **83.7 / B** |

Reproduce: `scoreTool({ name: "read_file", description: "Read a file.", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } }, [])` → total 47, byDimension 61/91/100/95/100. The weighted mean column is `Σ DIMENSION_WEIGHTS[d] × byDimension[d]` = 83.7.

A tool whose description is *literally twelve characters* scores a B under the weighted mean, because four healthy dimensions average the failure away. That is wrong in the direction that matters: the reader cares that there is a real defect, not that the other dimensions are fine.

The current model subtracts from 100:

```
total = 100 - Σ min(55, deduction_d)   for each dimension d
```

Same tool: **47 / F** on its own, **27 / F** once a confusable sibling exists (a `read_file_v2` sibling adds `ambiguity/name-collision` and its critical ceiling), and **19.0 / F** in `fixtures/raw/filesystem.json` where the full finding set applies. Two consequences fall out of this shape:

- **Per-dimension cap (55).** Twenty `info` hits in `schema` should not outweigh one `error` in `safety`. Capping keeps dimensions proportional while still letting a genuinely broken tool approach zero.
- **Critical ceiling (40).** Four rules mean the tool is not usable *at all* (`desc/missing`, `schema/missing`, `ambiguity/name-collision`, `safety/readonly-misdeclared`). When one fires, the total is clamped to 40 regardless of everything else. A tool the model cannot even identify should not be able to score 85 because its annotations are tidy.

---

## 3. Confusability: verbs and synonyms, not string distance

This was the hardest piece and the one with the most wrong turns.

### Attempt 1: trigram similarity

Dice coefficient over character trigrams. Measured values:

```
read_file      / read_file_v2      0.800
read_file      / write_file        0.316
read_text_file / read_file_bytes   0.444   ← model confuses these
list_tables    / list_views        0.381
```

Read the four numbers as two groups and the ordering is even right: the confusing pairs (0.800, 0.444) sit above the distinct ones (0.381, 0.316). The failure is that **no threshold cuts between them** — 0.444 and 0.381 differ by 0.06, so any cutoff is a coin flip on the next pair — and the metric measures **spelling**, which is not what a model reasons about: it reasons about **verb + object**.

### Attempt 2: Jaccard over tokens

Word overlap has the same problem, harder: it collapses pairs with opposite verdicts onto the same number. `read_text_file` / `read_file_bytes` (confusable) and `run_select_query` / `run_write_query` (distinct) both measure 0.500; `delete_path` / `delete_file` (confusable) and `list_tables` / `list_views` (distinct) both measure 0.333. Overlap tells you *how much* two names share, not whether the shared part names the same kind of thing.

### Attempt 3 (current): verb + synonym classes

```
if names are near-identical by trigram (>= 0.85)          -> 1.0   (`read_file` vs `readFile`)
if leading verbs differ                                  -> low (different action)
if leading verbs match:
    objects share a near-synonym pair                    -> 0.75  (`delete_path` vs `delete_file`)
    objects share a word, and the words that differ are
      action verbs on both sides                         -> 0.50  (`run_select_query` vs `run_write_query`)
    objects share a word otherwise                       -> 0.75  (`read_text_file` vs `read_file_bytes`)
    objects are unrelated                                -> 0.50  (`list_tables` vs `list_views`)
    one side is a bare verb                              -> 0.45
```

`read_file` vs `read_file_v2` scores 0.75 through the shared object word `file`: `v2` is a version suffix, not an object word, so it cannot separate the pair. The trigram shortcut (>= 0.85) exists for spelling twins like `read_file` vs `readFile`, which measure 1.00 because trigrams ignore case and underscores. Both signals are kept because they catch different failures — the shortcut catches one name spelled two ways, the object analysis catches two names for the same target. The verb-modifier branch came later, from `run_select_query` / `run_write_query` being flagged at 0.75 in the *polished* database fixture: the shared head noun `query` is not what names the tools, `select` vs `write` is.

### The bug this shipped with

The first version of the synonym table grouped everything in a domain together:

```ts
table: "dbentity", view: "dbentity", schema: "dbentity", column: "dbentity"
```

which made `list_tables` / `list_views` score 0.75 — flagged as confusable. They are not: a table and a view are different things, and the verbs plus objects are perfectly clear. The table now contains only genuine near-synonyms:

```ts
path/file/dir/directory/folder -> "location"
url/uri/link/href              -> "web"
text/string/content/body       -> "content"
message/email/mail/note        -> "msg"
```

The test suite pins both directions:

```ts
assert.ok(confusability("delete_path", "delete_file") >= 0.6);   // synonyms
assert.ok(confusability("list_tables", "list_views") < 0.6);     // distinct
```

Small table on purpose. Every addition is a claim about the world that can be wrong.

---

## 4. False positives were the main engineering problem

The first working version scored the *hand-polished* fixtures well below their real quality, with a long list of complaints. Every one of those was noise. Four fixes, each of which removed a class of false positive:

| False positive | Cause | Fix |
|---|---|---|
| `metadata` flagged as filler `data` | substring matching | match whole words with a boundary regex |
| `search_files` flagged as network tool | `search` in the network word list | ambiguous verbs only count when no filesystem word is present |
| "use `search_files` for that" flagged as network | sibling tool names read as this tool's behaviour | strip sibling names before scanning |
| `path` param "undocumented" though its schema describes it | rule only looked at prose | suppress when every required param is self-documented in the schema |

The result: the polished fixtures now carry zero error-level findings — a benchmark invariant, not an aspiration — and every remaining warning/info finding is actionable.

**A linter that cries wolf gets uninstalled.** Precision matters more than recall here, which is why several rules are deliberately conservative:

- `desc/no-usage-cue` requires ≥ 4 tools *and* a confusable sibling.
- `schema/unbounded-string` is suppressed when the param has a real description.
- `desc/params-undocumented` yields to schema-level documentation.

---

## 5. Two MCP transports

The normal path spawns the server and speaks JSON-RPC over pipes. That fails in two real situations:

1. sandboxes that forbid opening pipes to child processes (`spawn EPERM`)
2. CI environments where you would rather not run arbitrary server code

`probeServerBatch` writes the fixed request sequence (`initialize`, `initialized`, `tools/list`) to a file, redirects the child's stdin/stdout to files, and replays the response file. No pipes are opened.

The trade-off is real and worth stating: **batch cannot react to a response mid-flight**. It works because JSON-RPC over a stream is ordered and every MCP server processes requests in order. A server that reorders responses would break it.

`--transport auto` tries pipes first and falls back to batch on `EPERM`.

### Windows spawn quoting

`shell: true` is needed on Windows to launch `.cmd` shims (npx, pnpm, uv), but combining it with an args array is deprecated and escapes badly. The fix is to build one command line — and quote every token containing a space.

The test suite caught this: `process.execPath` is `C:\Program Files\nodejs\node.exe`, and unquoted it failed with `'C:\Program' is not recognized`. Worth recording because it is exactly the class of bug that only shows up on someone else's machine.

---

## 6. Fixtures are the spec

Rules are easy to write and easy to overfit. The paired fixtures (`raw/` vs `polished/` for the same API) are the actual specification: any rule change must keep the polished set free of error-level findings and the raw set low, or the benchmark fails.

This also means the fixture files double as documentation — if you want to know what "good" looks like, read `fixtures/polished/database.json`.

---

## What is *not* proven

Stated plainly, because the README makes a numeric claim:

- **The score is not a measured call-success rate.** No model was queried. The deduction weights and caps are a hypothesis about which failures matter, calibrated against these fixtures.
- **The benchmark shows separation, not validity.** That polished servers score ~59 points higher than raw ones (+59.2 mean gap on the current fixtures, see `benchmark/summary.json`) shows the linter is *consistent* with a human judgement of quality. It does not show the score predicts model behaviour.
- **The next step is the obvious one:** take the 32 fixture tools, generate ~200 routing prompts, run a real model, and plot score against correct-call rate. If the correlation is weak, the weights are wrong and should change. That experiment is not in this repo yet.

Until then, treat the number as a **relative** signal — good for ranking your own tools against each other and for catching regressions in CI — not as an absolute measure of quality.
