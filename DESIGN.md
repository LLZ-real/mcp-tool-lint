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

The first implementation scored each dimension 0–100, then took a weighted mean. It was too forgiving:

| | describing | schema | ambiguity | safety | ergonomics | **total** |
|---|---:|---:|---:|---:|---:|---:|
| `read_file` with `"Read a file."` | 57 | 100 | 88 | 90 | 100 | **81 / B** |

A tool whose description is *literally twelve characters* scored a B, because four healthy dimensions averaged the failure away. That is wrong in the direction that matters: the reader cares that there is a real defect, not that the other dimensions are fine.

The current model subtracts from 100:

```
total = 100 - Σ min(55, deduction_d)   for each dimension d
```

Same tool now scores **41 / F**. Two consequences fall out of this shape:

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

`read_text_file` / `read_file_bytes` at 0.444 sits *below* `read_file` / `write_file` at 0.316 by a comfortable margin, yet the first pair is genuinely confusing and the second is trivially distinct. Character overlap measures **spelling**, and spelling is not what a model reasons about — it reasons about **verb + object**.

### Attempt 2: Jaccard over tokens

Slightly better, same failure: `read_text_file` vs `read_file_bytes` → 0.500, identical to `list_tables` vs `list_views` → 0.500. Word overlap cannot separate "same kind of thing" from "different entities in the same domain".

### Attempt 3 (current): verb + synonym classes

```
if names are near-identical by trigram (>= 0.85)  -> 1.0
if leading verbs differ                            -> low (different action)
if leading verbs match:
    objects are near-synonyms  -> 0.75
    objects are unrelated      -> 0.50   (below the 0.6 threshold)
    one side is a bare verb    -> 0.45
```

`read_file` vs `read_file_v2` still needs the trigram shortcut, because `v2` is not an object word — it is a version suffix. That is why both signals are kept.

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

The first working version scored the *hand-polished* fixtures at 84.6 with a long list of complaints. Every one of those was noise. Four fixes, each of which removed a class of false positive:

| False positive | Cause | Fix |
|---|---|---|
| `metadata` flagged as filler `data` | substring matching | match whole words with a boundary regex |
| `search_files` flagged as network tool | `search` in the network word list | ambiguous verbs only count when no filesystem word is present |
| "use `search_files` for that" flagged as network | sibling tool names read as this tool's behaviour | strip sibling names before scanning |
| `path` param "undocumented" though its schema describes it | rule only looked at prose | suppress when every required param is self-documented in the schema |

The result: polished fixtures went 84.6 → 90.9, and every remaining finding is actionable.

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

Rules are easy to write and easy to overfit. The paired fixtures (`raw/` vs `polished/` for the same API) are the actual specification: any rule change must keep the polished set clean and the raw set low, or the benchmark fails.

This also means the fixture files double as documentation — if you want to know what "good" looks like, read `fixtures/polished/database.json`.

---

## What is *not* proven

Stated plainly, because the README makes a numeric claim:

- **The score is not a measured call-success rate.** No model was queried. The deduction weights and caps are a hypothesis about which failures matter, calibrated against these fixtures.
- **The benchmark shows separation, not validity.** That polished servers score 45 points higher than raw ones shows the linter is *consistent* with a human judgement of quality. It does not show the score predicts model behaviour.
- **The next step is the obvious one:** take the 32 fixture tools, generate ~200 routing prompts, run a real model, and plot score against correct-call rate. If the correlation is weak, the weights are wrong and should change. That experiment is not in this repo yet.

Until then, treat the number as a **relative** signal — good for ranking your own tools against each other and for catching regressions in CI — not as an absolute measure of quality.
