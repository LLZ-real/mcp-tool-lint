# Launch notes

Draft copy for posting. Edit before use — the numbers must match `benchmark/summary.json`.

---

## Hacker News (Show HN)

**Title:** Show HN: MCP tool linter – score your tool schemas for LLM-callability

**Body:**

I kept watching the same bug across MCP servers: the schema validates, the server runs, and the model still calls the wrong tool.

The causes are never crashes. They're descriptions that are 12 characters long, two tools named `read_file` and `read_file_v2`, a `mode` param typed as a bare string, a destructive tool with no `destructiveHint`. None of that fails a JSON Schema validator.

So I wrote a linter with 24 rules across five dimensions — describing, schema, ambiguity, safety, ergonomics — scored 0–100 by additive deduction, with the specific fix printed next to each finding.

The part I spent the most time on is the collision detector. The obvious approach is string similarity, and it's wrong:

```
read_text_file / read_file_bytes   trigrams 0.44   <- model WILL confuse these
read_file      / write_file        trigrams 0.32   <- nobody confuses these
```

What actually matters is same-verb + near-synonym object, so that's what it keys on. Getting the synonym table right took several wrong turns (I briefly had `table` and `view` in the same class, which flagged `list_tables` vs `list_views` — they're clearly distinct).

To keep myself honest I ship three API pairs, each written twice: as people actually write servers, and fixed. Raw averages 37.8, polished 83.1, gap +45.3, and the benchmark fails CI if that ordering breaks.

Honest limits: it's lexical heuristics, English-only, and the score is a hypothesis about model behaviour — no model was queried. It shows separation, not validity. The obvious next experiment is routing prompts + a real model + correlation against score.

`npx mcp-tool-lint fixtures/` — no build step, Node 22.6+ runs the TS directly.

---

## Reddit r/mcp

**Title:** I built a linter for MCP tool schemas — here's what it found in my own servers

**Body:**

Ran this over a few of my own MCP servers and the top hits were humbling:

- `schema/param-undescribed` — 24 hits. The single most common gap. Most clients render the param description right next to the field, and it's empty.
- `schema/unbounded-string` — 17 hits. Bare `type: string` with no format, pattern, or examples.
- `desc/too-short` — 14 hits. Descriptions under 25 chars.
- `safety/no-annotations` — 16 hits. No `readOnlyHint`/`destructiveHint`, so clients can't tell a reader from a deleter.

The one I did not expect: **`list_tables` vs `list_views` are not confusable, but `delete_path` vs `delete_file` are.** Word overlap can't tell the difference — it needs a notion of near-synonym. That's now the core of the collision rule.

CLI, JSON, and Markdown output; `--fail-under` for CI; can probe a live server over stdio or read saved fixtures.

---

## X / Twitter thread

**1/**
Your MCP server passes schema validation and the model still calls the wrong tool.

I built a linter for that. 24 rules, 5 dimensions, 0–100.

**2/**
The failure is never a crash. It's:
· a 12-char description
· `read_file` next to `read_file_v2`
· `mode: string` with no enum
· a destructive tool with no `destructiveHint`

**3/**
String similarity is the obvious way to catch name collisions. It's wrong.

`read_text_file` / `read_file_bytes` → 0.44 trigrams
`read_file` / `write_file` → 0.32 trigrams

The first pair is confusing. The second isn't.

**4/**
What actually matters: same verb + near-synonym object.

`delete_path` / `delete_file` → 0.75 (path≈file)
`list_tables` / `list_views` → 0.50 (different entities)

I shipped a bug where table≈view. The test suite caught it in ten minutes.

**5/**
To keep myself honest: 3 APIs, each written twice — raw and fixed.

raw 37.8 → polished 83.1 (+45.3)
Benchmark fails CI if the ordering breaks.

**6/**
Honest limits: lexical heuristics, English-only, and the score is a hypothesis — no model was queried. It shows separation, not validity.

Next: routing prompts + a real model + correlation.

`npx mcp-tool-lint fixtures/`

---

## Posting checklist

- [x] Replace `<your name>` in LICENSE
- [ ] Record a 30s GIF: run on `fixtures/`, show raw → F, polished → A
- [ ] Push to GitHub with a meaningful commit history (not one dump)
- [ ] Add topics: `mcp`, `llm`, `agents`, `tool-calling`, `linter`
- [ ] Verify `npx mcp-tool-lint` works from a clean directory before posting
- [ ] Numbers in every post match `benchmark/summary.json` exactly
