# MCP tool lint report

Generated 2026-11-02T07:14:48.191Z · mcp-tool-lint v0.1.0

**32 tools · 21 errors · 84 warnings · average score 60.6/100**

## Dimension scores

| Dimension | Score | Weight |
|---|---:|---:|
| describing | 83.6 | ×0.34 |
| schema | 90.1 | ×0.28 |
| ambiguity | 95.3 | ×0.20 |
| safety | 95.1 | ×0.10 |
| ergonomics | 98.9 | ×0.08 |

## Servers

| Server | Tools | Score | Grade |
|---|---:|---:|:---:|
| `database` | 5 | 80.4 | B |
| `filesystem` | 7 | 90.9 | A |
| `web-fetch` | 3 | 78.0 | C |
| `database` | 6 | 45.5 | F |
| `filesystem-raw` | 7 | 41.3 | F |
| `web-fetch` | 4 | 26.5 | F |

## `database` — 80.4/100

| Tool | Score | Top issue |
|---|---:|:---|
| `run_select_query` | 40.0 | `run_select_query` and `run_write_query` are 75% confusable — same verb, overlapping object. |
| `run_write_query` | 82.0 | Name starts with vague verb `run`. |
| `describe_table` | 100.0 | — |
| `list_tables` | 92.0 | All 2 params are optional; nothing anchors a minimal call. |
| `list_views` | 88.0 | All 1 params are optional; nothing anchors a minimal call. |

<details><summary>All findings</summary>

### `run_select_query` — 40.0/100

- **ambiguity/name-collision** (error, −20) — `run_select_query` and `run_write_query` are 75% confusable — same verb, overlapping object.
  - ↳ Rename one to reflect the distinguishing dimension (scope, target, format), or merge them behind a `mode` enum.
- **ambiguity/vague-verb** (warning, −10) — Name starts with vague verb `run`.
  - ↳ Use a specific verb: read/write/create/delete/search/list/convert/...

### `run_write_query` — 82.0/100

- **ambiguity/vague-verb** (warning, −10) — Name starts with vague verb `run`.
  - ↳ Use a specific verb: read/write/create/delete/search/list/convert/...
- **schema/weak-param-name** (warning, −8) — Param name `params` is not self-describing.
  - ↳ Rename to what it holds, e.g. `file_path`, `query`, `max_results`.

### `list_tables` — 92.0/100

- **schema/all-optional** (warning, −8) — All 2 params are optional; nothing anchors a minimal call.
  - ↳ Mark the semantically necessary one(s) as required.

### `list_views` — 88.0/100

- **schema/all-optional** (warning, −8) — All 1 params are optional; nothing anchors a minimal call.
  - ↳ Mark the semantically necessary one(s) as required.
- **desc/generic** (warning, −4) — Generic filler: "used to".
  - ↳ Replace filler with the concrete object and effect, e.g. "Reads a UTF-8 file from disk and returns its contents".

</details>

## `filesystem` — 90.9/100

| Tool | Score | Top issue |
|---|---:|:---|
| `read_text_file` | 100.0 | — |
| `read_file_bytes` | 40.0 | `read_file_bytes` and `read_text_file` are 75% confusable — same verb, overlapping object. |
| `write_text_file` | 100.0 | — |
| `delete_path` | 96.0 | Description never states what the tool returns. |
| `list_directory` | 100.0 | — |
| `search_files` | 100.0 | — |
| `stat_path` | 100.0 | — |

<details><summary>All findings</summary>

### `read_file_bytes` — 40.0/100

- **ambiguity/name-collision** (error, −20) — `read_file_bytes` and `read_text_file` are 75% confusable — same verb, overlapping object.
  - ↳ Rename one to reflect the distinguishing dimension (scope, target, format), or merge them behind a `mode` enum.

### `delete_path` — 96.0/100

- **desc/no-return** (info, −4) — Description never states what the tool returns.
  - ↳ Append a returns clause, e.g. "Returns the file contents as a UTF-8 string."

</details>

## `web-fetch` — 78.0/100

| Tool | Score | Top issue |
|---|---:|:---|
| `fetch_url` | 40.0 | `fetch_url` and `fetch_url_bytes` are 75% confusable — same verb, overlapping object. |
| `fetch_url_bytes` | 100.0 | — |
| `clear_http_cache` | 94.0 | Tool appears to reach the network but `openWorldHint` is not set. |

<details><summary>All findings</summary>

### `fetch_url` — 40.0/100

- **ambiguity/name-collision** (error, −20) — `fetch_url` and `fetch_url_bytes` are 75% confusable — same verb, overlapping object.
  - ↳ Rename one to reflect the distinguishing dimension (scope, target, format), or merge them behind a `mode` enum.
- **schema/bare-object** (warning, −10) — Param `headers` is an unconstrained object.
  - ↳ Declare `"properties"`, or set `"additionalProperties": false` if the shape is fixed.

### `clear_http_cache` — 94.0/100

- **safety/open-world-undeclared** (info, −6) — Tool appears to reach the network but `openWorldHint` is not set.
  - ↳ Set `"openWorldHint": true`.

</details>

## `database` — 45.5/100

| Tool | Score | Top issue |
|---|---:|:---|
| `query` | 47.0 | Description is only 12 chars ("Run a query.") — too short to distinguish from sibling tools. |
| `exec` | 57.0 | Description is only 12 chars ("Execute SQL.") — too short to distinguish from sibling tools. |
| `drop_table` | 24.0 | Description is only 14 chars ("Drops a table.") — too short to distinguish from sibling tools. |
| `list_tables` | 49.0 | Description is only 13 chars ("Lists tables.") — too short to distinguish from sibling tools. |
| `list_views` | 49.0 | Description is only 12 chars ("Lists views.") — too short to distinguish from sibling tools. |
| `get_table` | 47.0 | Description is only 10 chars ("Get table.") — too short to distinguish from sibling tools. |

<details><summary>All findings</summary>

### `query` — 47.0/100

- **desc/too-short** (error, −25) — Description is only 12 chars ("Run a query.") — too short to distinguish from sibling tools.
  - ↳ Expand to at least one sentence: what it does + what it returns.
- **desc/params-undocumented** (warning, −10) — None of the required params (sql) appear in the description.
  - ↳ Either mention them, e.g. "sql is the absolute path to read.", or give each one a `description` in the schema.
- **schema/param-undescribed** (warning, −6) — Param `sql` has no description.
  - ↳ Add "description": "The sql."
- **schema/unbounded-string** (warning, −3) — String param `sql` has no `format`, `pattern`, `enum`, `examples`, or description.
  - ↳ Add "format" (e.g. "uri", "date-time", "path"), "examples": [...], or at minimum a `description`.
- **safety/no-annotations** (info, −5) — No `annotations` block; clients cannot classify risk.
  - ↳ Add at least `{ "readOnlyHint": true }` or `{ "destructiveHint": true }`.
- **desc/no-return** (info, −4) — Description never states what the tool returns.
  - ↳ Append a returns clause, e.g. "Returns the file contents as a UTF-8 string."

### `exec` — 57.0/100

- **desc/too-short** (error, −25) — Description is only 12 chars ("Execute SQL.") — too short to distinguish from sibling tools.
  - ↳ Expand to at least one sentence: what it does + what it returns.
- **schema/param-undescribed** (warning, −6) — Param `sql` has no description.
  - ↳ Add "description": "The sql."
- **schema/unbounded-string** (warning, −3) — String param `sql` has no `format`, `pattern`, `enum`, `examples`, or description.
  - ↳ Add "format" (e.g. "uri", "date-time", "path"), "examples": [...], or at minimum a `description`.
- **safety/no-annotations** (info, −5) — No `annotations` block; clients cannot classify risk.
  - ↳ Add at least `{ "readOnlyHint": true }` or `{ "destructiveHint": true }`.
- **desc/no-return** (info, −4) — Description never states what the tool returns.
  - ↳ Append a returns clause, e.g. "Returns the file contents as a UTF-8 string."

### `drop_table` — 24.0/100

- **desc/too-short** (error, −25) — Description is only 14 chars ("Drops a table.") — too short to distinguish from sibling tools.
  - ↳ Expand to at least one sentence: what it does + what it returns.
- **safety/destructive-undeclared** (warning, −15) — Name/description implies destruction but `destructiveHint` is not set.
  - ↳ Set `"annotations": { "destructiveHint": true }` so clients can gate it behind confirmation.
- **desc/params-undocumented** (warning, −10) — None of the required params (name) appear in the description.
  - ↳ Either mention them, e.g. "name is the absolute path to read.", or give each one a `description` in the schema.
- **ambiguity/no-verb** (warning, −8) — `drop_table` reads as a noun; no verb describes the effect.
  - ↳ Rename to `get_drop_table`.
- **schema/param-undescribed** (warning, −6) — Param `name` has no description.
  - ↳ Add "description": "The name."
- **schema/unbounded-string** (warning, −3) — String param `name` has no `format`, `pattern`, `enum`, `examples`, or description.
  - ↳ Add "format" (e.g. "uri", "date-time", "path"), "examples": [...], or at minimum a `description`.
- **safety/no-annotations** (info, −5) — No `annotations` block; clients cannot classify risk.
  - ↳ Add at least `{ "readOnlyHint": true }` or `{ "destructiveHint": true }`.
- **desc/no-return** (info, −4) — Description never states what the tool returns.
  - ↳ Append a returns clause, e.g. "Returns the file contents as a UTF-8 string."

### `list_tables` — 49.0/100

- **desc/too-short** (error, −25) — Description is only 13 chars ("Lists tables.") — too short to distinguish from sibling tools.
  - ↳ Expand to at least one sentence: what it does + what it returns.
- **schema/all-optional** (warning, −8) — All 1 params are optional; nothing anchors a minimal call.
  - ↳ Mark the semantically necessary one(s) as required.
- **schema/param-undescribed** (warning, −6) — Param `schema` has no description.
  - ↳ Add "description": "The schema."
- **schema/unbounded-string** (warning, −3) — String param `schema` has no `format`, `pattern`, `enum`, `examples`, or description.
  - ↳ Add "format" (e.g. "uri", "date-time", "path"), "examples": [...], or at minimum a `description`.
- **safety/no-annotations** (info, −5) — No `annotations` block; clients cannot classify risk.
  - ↳ Add at least `{ "readOnlyHint": true }` or `{ "destructiveHint": true }`.
- **desc/no-return** (info, −4) — Description never states what the tool returns.
  - ↳ Append a returns clause, e.g. "Returns the file contents as a UTF-8 string."

### `list_views` — 49.0/100

- **desc/too-short** (error, −25) — Description is only 12 chars ("Lists views.") — too short to distinguish from sibling tools.
  - ↳ Expand to at least one sentence: what it does + what it returns.
- **schema/all-optional** (warning, −8) — All 1 params are optional; nothing anchors a minimal call.
  - ↳ Mark the semantically necessary one(s) as required.
- **schema/param-undescribed** (warning, −6) — Param `schema` has no description.
  - ↳ Add "description": "The schema."
- **schema/unbounded-string** (warning, −3) — String param `schema` has no `format`, `pattern`, `enum`, `examples`, or description.
  - ↳ Add "format" (e.g. "uri", "date-time", "path"), "examples": [...], or at minimum a `description`.
- **safety/no-annotations** (info, −5) — No `annotations` block; clients cannot classify risk.
  - ↳ Add at least `{ "readOnlyHint": true }` or `{ "destructiveHint": true }`.
- **desc/no-return** (info, −4) — Description never states what the tool returns.
  - ↳ Append a returns clause, e.g. "Returns the file contents as a UTF-8 string."

### `get_table` — 47.0/100

- **desc/too-short** (error, −25) — Description is only 10 chars ("Get table.") — too short to distinguish from sibling tools.
  - ↳ Expand to at least one sentence: what it does + what it returns.
- **desc/params-undocumented** (warning, −10) — None of the required params (name) appear in the description.
  - ↳ Either mention them, e.g. "name is the absolute path to read.", or give each one a `description` in the schema.
- **schema/param-undescribed** (warning, −6) — Param `name` has no description.
  - ↳ Add "description": "The name."
- **schema/unbounded-string** (warning, −3) — String param `name` has no `format`, `pattern`, `enum`, `examples`, or description.
  - ↳ Add "format" (e.g. "uri", "date-time", "path"), "examples": [...], or at minimum a `description`.
- **safety/no-annotations** (info, −5) — No `annotations` block; clients cannot classify risk.
  - ↳ Add at least `{ "readOnlyHint": true }` or `{ "destructiveHint": true }`.
- **desc/no-return** (info, −4) — Description never states what the tool returns.
  - ↳ Append a returns clause, e.g. "Returns the file contents as a UTF-8 string."

</details>

## `filesystem-raw` — 41.3/100

| Tool | Score | Top issue |
|---|---:|:---|
| `read_file` | 19.0 | Description is only 12 chars ("Read a file.") — too short to distinguish from sibling tools. |
| `read_file_v2` | 39.0 | Description is only 12 chars ("Read a file.") — too short to distinguish from sibling tools. |
| `write` | 28.0 | Description is only 6 chars ("Write.") — too short to distinguish from sibling tools. |
| `delete` | 51.0 | Name/description implies destruction but `destructiveHint` is not set. |
| `ls` | 58.0 | Description is only 5 chars ("List.") — too short to distinguish from sibling tools. |
| `handle` | 30.0 | Param `data` declares no `type`. |
| `file_info` | 64.0 | None of the required params (path) appear in the description. |

<details><summary>All findings</summary>

### `read_file` — 19.0/100

- **desc/too-short** (error, −25) — Description is only 12 chars ("Read a file.") — too short to distinguish from sibling tools.
  - ↳ Expand to at least one sentence: what it does + what it returns.
- **ambiguity/name-collision** (error, −20) — `read_file` and `read_file_v2` are 75% confusable — same verb, overlapping object.
  - ↳ Rename one to reflect the distinguishing dimension (scope, target, format), or merge them behind a `mode` enum.
- **desc/params-undocumented** (warning, −10) — None of the required params (path) appear in the description.
  - ↳ Either mention them, e.g. "path is the absolute path to read.", or give each one a `description` in the schema.
- **desc/no-usage-cue** (warning, −8) — Description never says when to use it instead of `read_file_v2`.
  - ↳ Add a disambiguating clause, e.g. "Use this for text; use read_file_v2 for binary files."
- **schema/param-undescribed** (warning, −6) — Param `path` has no description.
  - ↳ Add "description": "The path."
- **schema/unbounded-string** (warning, −3) — String param `path` has no `format`, `pattern`, `enum`, `examples`, or description.
  - ↳ Add "format" (e.g. "uri", "date-time", "path"), "examples": [...], or at minimum a `description`.
- **safety/no-annotations** (info, −5) — No `annotations` block; clients cannot classify risk.
  - ↳ Add at least `{ "readOnlyHint": true }` or `{ "destructiveHint": true }`.
- **desc/no-return** (info, −4) — Description never states what the tool returns.
  - ↳ Append a returns clause, e.g. "Returns the file contents as a UTF-8 string."

### `read_file_v2` — 39.0/100

- **desc/too-short** (error, −25) — Description is only 12 chars ("Read a file.") — too short to distinguish from sibling tools.
  - ↳ Expand to at least one sentence: what it does + what it returns.
- **desc/params-undocumented** (warning, −10) — None of the required params (path) appear in the description.
  - ↳ Either mention them, e.g. "path is the absolute path to read.", or give each one a `description` in the schema.
- **desc/no-usage-cue** (warning, −8) — Description never says when to use it instead of `read_file`.
  - ↳ Add a disambiguating clause, e.g. "Use this for text; use read_file for binary files."
- **schema/param-undescribed** (warning, −6) — Param `path` has no description.
  - ↳ Add "description": "The path."
- **schema/unbounded-string** (warning, −3) — String param `path` has no `format`, `pattern`, `enum`, `examples`, or description.
  - ↳ Add "format" (e.g. "uri", "date-time", "path"), "examples": [...], or at minimum a `description`.
- **safety/no-annotations** (info, −5) — No `annotations` block; clients cannot classify risk.
  - ↳ Add at least `{ "readOnlyHint": true }` or `{ "destructiveHint": true }`.
- **desc/no-return** (info, −4) — Description never states what the tool returns.
  - ↳ Append a returns clause, e.g. "Returns the file contents as a UTF-8 string."

### `write` — 28.0/100

- **desc/too-short** (error, −25) — Description is only 6 chars ("Write.") — too short to distinguish from sibling tools.
  - ↳ Expand to at least one sentence: what it does + what it returns.
- **schema/all-optional** (warning, −8) — All 4 params are optional; nothing anchors a minimal call.
  - ↳ Mark the semantically necessary one(s) as required.
- **schema/param-undescribed** (warning, −6) — Param `path` has no description.
  - ↳ Add "description": "The path."
- **schema/param-undescribed** (warning, −6) — Param `content` has no description.
  - ↳ Add "description": "The content."
- **schema/param-undescribed** (warning, −6) — Param `append` has no description.
  - ↳ Add "description": "Whether to append."
- **schema/param-undescribed** (warning, −6) — Param `create_dirs` has no description.
  - ↳ Add "description": "Whether to create dirs."
- **schema/unbounded-string** (warning, −3) — String param `path` has no `format`, `pattern`, `enum`, `examples`, or description.
  - ↳ Add "format" (e.g. "uri", "date-time", "path"), "examples": [...], or at minimum a `description`.
- **schema/unbounded-string** (warning, −3) — String param `content` has no `format`, `pattern`, `enum`, `examples`, or description.
  - ↳ Add "format" (e.g. "uri", "date-time", "path"), "examples": [...], or at minimum a `description`.
- **safety/no-annotations** (info, −5) — No `annotations` block; clients cannot classify risk.
  - ↳ Add at least `{ "readOnlyHint": true }` or `{ "destructiveHint": true }`.
- **desc/no-return** (info, −4) — Description never states what the tool returns.
  - ↳ Append a returns clause, e.g. "Returns the file contents as a UTF-8 string."

### `delete` — 51.0/100

- **safety/destructive-undeclared** (warning, −15) — Name/description implies destruction but `destructiveHint` is not set.
  - ↳ Set `"annotations": { "destructiveHint": true }` so clients can gate it behind confirmation.
- **desc/params-undocumented** (warning, −10) — None of the required params (path) appear in the description.
  - ↳ Either mention them, e.g. "path is the absolute path to read.", or give each one a `description` in the schema.
- **schema/param-undescribed** (warning, −6) — Param `path` has no description.
  - ↳ Add "description": "The path."
- **schema/param-undescribed** (warning, −6) — Param `recursive` has no description.
  - ↳ Add "description": "Whether to recursive."
- **schema/unbounded-string** (warning, −3) — String param `path` has no `format`, `pattern`, `enum`, `examples`, or description.
  - ↳ Add "format" (e.g. "uri", "date-time", "path"), "examples": [...], or at minimum a `description`.
- **safety/no-annotations** (info, −5) — No `annotations` block; clients cannot classify risk.
  - ↳ Add at least `{ "readOnlyHint": true }` or `{ "destructiveHint": true }`.
- **desc/no-return** (info, −4) — Description never states what the tool returns.
  - ↳ Append a returns clause, e.g. "Returns the file contents as a UTF-8 string."

### `ls` — 58.0/100

- **desc/too-short** (error, −25) — Description is only 5 chars ("List.") — too short to distinguish from sibling tools.
  - ↳ Expand to at least one sentence: what it does + what it returns.
- **ambiguity/no-verb** (warning, −8) — `ls` reads as a noun; no verb describes the effect.
  - ↳ Rename to `list_ls`.
- **safety/no-annotations** (info, −5) — No `annotations` block; clients cannot classify risk.
  - ↳ Add at least `{ "readOnlyHint": true }` or `{ "destructiveHint": true }`.
- **desc/no-return** (info, −4) — Description never states what the tool returns.
  - ↳ Append a returns clause, e.g. "Returns the file contents as a UTF-8 string."

### `handle` — 30.0/100

- **schema/untyped-param** (error, −12) — Param `data` declares no `type`.
  - ↳ Add "type": "string"
- **ambiguity/vague-verb** (warning, −10) — Name starts with vague verb `handle`.
  - ↳ Use a specific verb: read/write/create/delete/search/list/convert/...
- **ergonomics/mode-without-enum** (warning, −8) — Mode-like param `mode` has no `enum`.
  - ↳ Add "enum": [...] listing every legal value.
- **schema/all-optional** (warning, −8) — All 2 params are optional; nothing anchors a minimal call.
  - ↳ Mark the semantically necessary one(s) as required.
- **schema/weak-param-name** (warning, −8) — Param name `data` is not self-describing.
  - ↳ Rename to what it holds, e.g. `file_path`, `query`, `max_results`.
- **schema/param-undescribed** (warning, −6) — Param `data` has no description.
  - ↳ Add "description": "The data."
- **schema/param-undescribed** (warning, −6) — Param `mode` has no description.
  - ↳ Add "description": "The mode."
- **schema/unbounded-string** (warning, −3) — String param `mode` has no `format`, `pattern`, `enum`, `examples`, or description.
  - ↳ Add "format" (e.g. "uri", "date-time", "path"), "examples": [...], or at minimum a `description`.
- **safety/no-annotations** (info, −5) — No `annotations` block; clients cannot classify risk.
  - ↳ Add at least `{ "readOnlyHint": true }` or `{ "destructiveHint": true }`.
- **desc/no-return** (info, −4) — Description never states what the tool returns.
  - ↳ Append a returns clause, e.g. "Returns the file contents as a UTF-8 string."

### `file_info` — 64.0/100

- **desc/params-undocumented** (warning, −10) — None of the required params (path) appear in the description.
  - ↳ Either mention them, e.g. "path is the absolute path to read.", or give each one a `description` in the schema.
- **ambiguity/no-verb** (warning, −8) — `file_info` reads as a noun; no verb describes the effect.
  - ↳ Rename to `get_file_info`.
- **schema/param-undescribed** (warning, −6) — Param `path` has no description.
  - ↳ Add "description": "The path."
- **desc/generic** (warning, −4) — Generic filler: "this tool".
  - ↳ Replace filler with the concrete object and effect, e.g. "Reads a UTF-8 file from disk and returns its contents".
- **schema/unbounded-string** (warning, −3) — String param `path` has no `format`, `pattern`, `enum`, `examples`, or description.
  - ↳ Add "format" (e.g. "uri", "date-time", "path"), "examples": [...], or at minimum a `description`.
- **safety/no-annotations** (info, −5) — No `annotations` block; clients cannot classify risk.
  - ↳ Add at least `{ "readOnlyHint": true }` or `{ "destructiveHint": true }`.

</details>

## `web-fetch` — 26.5/100

| Tool | Score | Top issue |
|---|---:|:---|
| `get` | 35.0 | Description is only 11 chars ("Gets stuff.") — too short to distinguish from sibling tools. |
| `get_url` | 43.0 | Description is only 10 chars ("Get a URL.") — too short to distinguish from sibling tools. |
| `process` | 0.0 | Description is only 23 chars ("Processes the response.") — too short to distinguish from sibling tools. |
| `reset` | 28.0 | Description is only 17 chars ("Resets the cache.") — too short to distinguish from sibling tools. |

<details><summary>All findings</summary>

### `get` — 35.0/100

- **desc/too-short** (error, −25) — Description is only 11 chars ("Gets stuff.") — too short to distinguish from sibling tools.
  - ↳ Expand to at least one sentence: what it does + what it returns.
- **desc/params-undocumented** (warning, −10) — None of the required params (u) appear in the description.
  - ↳ Either mention them, e.g. "u is the absolute path to read.", or give each one a `description` in the schema.
- **schema/weak-param-name** (warning, −8) — Param name `u` is not self-describing.
  - ↳ Rename to what it holds, e.g. `file_path`, `query`, `max_results`.
- **schema/param-undescribed** (warning, −6) — Param `u` has no description.
  - ↳ Add "description": "The u."
- **desc/generic** (warning, −4) — Generic filler: "stuff".
  - ↳ Replace filler with the concrete object and effect, e.g. "Reads a UTF-8 file from disk and returns its contents".
- **schema/unbounded-string** (warning, −3) — String param `u` has no `format`, `pattern`, `enum`, `examples`, or description.
  - ↳ Add "format" (e.g. "uri", "date-time", "path"), "examples": [...], or at minimum a `description`.
- **safety/no-annotations** (info, −5) — No `annotations` block; clients cannot classify risk.
  - ↳ Add at least `{ "readOnlyHint": true }` or `{ "destructiveHint": true }`.
- **desc/no-return** (info, −4) — Description never states what the tool returns.
  - ↳ Append a returns clause, e.g. "Returns the file contents as a UTF-8 string."

### `get_url` — 43.0/100

- **desc/too-short** (error, −25) — Description is only 10 chars ("Get a URL.") — too short to distinguish from sibling tools.
  - ↳ Expand to at least one sentence: what it does + what it returns.
- **schema/all-optional** (warning, −8) — All 1 params are optional; nothing anchors a minimal call.
  - ↳ Mark the semantically necessary one(s) as required.
- **schema/param-undescribed** (warning, −6) — Param `url` has no description.
  - ↳ Add "description": "The url."
- **schema/unbounded-string** (warning, −3) — String param `url` has no `format`, `pattern`, `enum`, `examples`, or description.
  - ↳ Add "format" (e.g. "uri", "date-time", "path"), "examples": [...], or at minimum a `description`.
- **safety/open-world-undeclared** (info, −6) — Tool appears to reach the network but `openWorldHint` is not set.
  - ↳ Set `"openWorldHint": true`.
- **safety/no-annotations** (info, −5) — No `annotations` block; clients cannot classify risk.
  - ↳ Add at least `{ "readOnlyHint": true }` or `{ "destructiveHint": true }`.
- **desc/no-return** (info, −4) — Description never states what the tool returns.
  - ↳ Append a returns clause, e.g. "Returns the file contents as a UTF-8 string."

### `process` — 0.0/100

- **desc/too-short** (error, −25) — Description is only 23 chars ("Processes the response.") — too short to distinguish from sibling tools.
  - ↳ Expand to at least one sentence: what it does + what it returns.
- **schema/untyped-param** (error, −12) — Param `data` declares no `type`.
  - ↳ Add "type": "string"
- **ambiguity/vague-verb** (warning, −10) — Name starts with vague verb `process`.
  - ↳ Use a specific verb: read/write/create/delete/search/list/convert/...
- **ergonomics/god-tool** (warning, −10) — `process` takes 11 params.
  - ↳ Split into focused tools, or nest the optional ones under one object param.
- **schema/bare-object** (warning, −10) — Param `headers` is an unconstrained object.
  - ↳ Declare `"properties"`, or set `"additionalProperties": false` if the shape is fixed.
- **schema/bare-object** (warning, −10) — Param `cookies` is an unconstrained object.
  - ↳ Declare `"properties"`, or set `"additionalProperties": false` if the shape is fixed.
- **ergonomics/boolean-trap** (warning, −8) — 2 mode-like boolean flags (raw, pretty) — 4 combinations, some contradictory.
  - ↳ Replace mutually exclusive flags with a single `mode` enum, e.g. `"mode": "recursive" | "shallow"`.
- **ergonomics/mode-without-enum** (warning, −8) — Mode-like param `mode` has no `enum`.
  - ↳ Add "enum": [...] listing every legal value.
- **schema/all-optional** (warning, −8) — All 11 params are optional; nothing anchors a minimal call.
  - ↳ Mark the semantically necessary one(s) as required.
- **schema/weak-param-name** (warning, −8) — Param name `data` is not self-describing.
  - ↳ Rename to what it holds, e.g. `file_path`, `query`, `max_results`.
- **schema/param-undescribed** (warning, −6) — Param `data` has no description.
  - ↳ Add "description": "The data."
- **schema/param-undescribed** (warning, −6) — Param `mode` has no description.
  - ↳ Add "description": "The mode."
- **schema/param-undescribed** (warning, −6) — Param `raw` has no description.
  - ↳ Add "description": "Whether to raw."
- **schema/param-undescribed** (warning, −6) — Param `pretty` has no description.
  - ↳ Add "description": "Whether to pretty."
- **schema/param-undescribed** (warning, −6) — Param `timeout` has no description.
  - ↳ Add "description": "The timeout as a number."
- **schema/unbounded-string** (warning, −3) — String param `mode` has no `format`, `pattern`, `enum`, `examples`, or description.
  - ↳ Add "format" (e.g. "uri", "date-time", "path"), "examples": [...], or at minimum a `description`.
- **schema/unbounded-string** (warning, −3) — String param `proxy` has no `format`, `pattern`, `enum`, `examples`, or description.
  - ↳ Add "format" (e.g. "uri", "date-time", "path"), "examples": [...], or at minimum a `description`.
- **safety/no-annotations** (info, −5) — No `annotations` block; clients cannot classify risk.
  - ↳ Add at least `{ "readOnlyHint": true }` or `{ "destructiveHint": true }`.
- **desc/no-return** (info, −4) — Description never states what the tool returns.
  - ↳ Append a returns clause, e.g. "Returns the file contents as a UTF-8 string."

### `reset` — 28.0/100

- **desc/too-short** (error, −25) — Description is only 17 chars ("Resets the cache.") — too short to distinguish from sibling tools.
  - ↳ Expand to at least one sentence: what it does + what it returns.
- **safety/readonly-misdeclared** (error, −20) — `readOnlyHint: true` contradicts destructive wording in the name/description.
  - ↳ Remove `readOnlyHint`, or set it to `false` and add `destructiveHint: true`.
- **safety/destructive-undeclared** (warning, −15) — Name/description implies destruction but `destructiveHint` is not set.
  - ↳ Set `"annotations": { "destructiveHint": true }` so clients can gate it behind confirmation.
- **ambiguity/no-verb** (warning, −8) — `reset` reads as a noun; no verb describes the effect.
  - ↳ Rename to `get_reset`.
- **desc/no-return** (info, −4) — Description never states what the tool returns.
  - ↳ Append a returns clause, e.g. "Returns the file contents as a UTF-8 string."

</details>

## Rules by frequency

| Rule | Count | Total penalty |
|---|---:|---:|
| `schema/param-undescribed` | 24 | −144 |
| `desc/no-return` | 17 | −68 |
| `schema/unbounded-string` | 17 | −51 |
| `safety/no-annotations` | 16 | −80 |
| `desc/too-short` | 14 | −350 |
| `desc/params-undocumented` | 8 | −80 |
| `schema/all-optional` | 8 | −64 |
| `ambiguity/name-collision` | 4 | −80 |
| `ambiguity/no-verb` | 4 | −32 |
| `ambiguity/vague-verb` | 4 | −40 |
| `schema/weak-param-name` | 4 | −32 |
| `desc/generic` | 3 | −12 |
| `safety/destructive-undeclared` | 3 | −45 |
| `schema/bare-object` | 3 | −30 |
| `desc/no-usage-cue` | 2 | −16 |
| `ergonomics/mode-without-enum` | 2 | −16 |
| `safety/open-world-undeclared` | 2 | −12 |
| `schema/untyped-param` | 2 | −24 |
| `ergonomics/boolean-trap` | 1 | −8 |
| `ergonomics/god-tool` | 1 | −10 |
| `safety/readonly-misdeclared` | 1 | −20 |
