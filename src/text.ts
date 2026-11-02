/**
 * Text utilities tuned for the two things an LLM caller actually sees:
 * the tool *name* and the tool *description*. No NLP dependencies — every
 * signal here has to be explainable in one sentence to the user.
 */

const STOP_WORDS = new Set([
  "a", "an", "the", "this", "that", "these", "those", "it", "its",
  "is", "are", "was", "were", "be", "been", "being",
  "to", "of", "in", "on", "at", "by", "for", "with", "from", "into",
  "and", "or", "but", "not", "no", "if", "then", "than", "as",
  "you", "your", "we", "our", "i", "me", "my",
  "can", "will", "should", "may", "might", "must",
  "use", "used", "using", "uses", "will be", "returns", "return",
  "tool", "function", "method", "call", "calls", "called",
]);

/** Verbs that make a tool name tell you *what happens*, not just *what exists*. */
const STRONG_VERBS = new Set([
  "read", "write", "create", "delete", "remove", "update", "patch", "edit",
  "list", "get", "fetch", "search", "find", "query", "lookup",
  "add", "insert", "append", "push", "put", "post",
  "move", "copy", "rename", "mkdir", "rmdir",
  "run", "execute", "exec", "spawn", "invoke", "trigger",
  "open", "close", "start", "stop", "restart", "kill", "terminate",
  "send", "publish", "emit", "post", "upload", "download",
  "parse", "convert", "transform", "render", "format", "encode", "decode",
  "compile", "build", "bundle", "minify", "transpile",
  "analyze", "inspect", "examine", "check", "validate", "verify", "lint",
  "test", "benchmark", "profile", "trace", "measure",
  "generate", "summarize", "translate", "classify", "extract", "embed",
  "navigate", "click", "type", "scroll", "hover", "screenshot",
  "diff", "merge", "rebase", "commit", "checkout", "branch", "clone",
  "deploy", "provision", "scale", "monitor", "alert",
  "authenticate", "authorize", "login", "logout", "refresh",
  "count", "aggregate", "group", "sort", "filter", "map", "reduce",
  "load", "save", "store", "cache", "flush", "sync", "index",
  "compare", "match", "resolve", "expand", "flatten", "normalize",
  "watch", "subscribe", "unsubscribe", "listen", "poll",
  "encrypt", "decrypt", "hash", "sign", "verify",
  "install", "uninstall", "upgrade", "migrate", "rollback",
  "describe", "explain", "preview", "plan", "apply",
  "stat", "glob", "grep", "walk", "enumerate", "inspect",
  "select", "drop", "reset", "clear", "upsert",
  "truncate", "slice", "split", "join", "replace", "strip", "trim",
  "validate", "sanitize", "escape", "quote", "wrap", "unwrap",
  "resize", "crop", "rotate", "flip", "composite", "blur", "sharpen",
  "transcribe", "synthesize", "speak", "listen", "record",
  "embed", "rerank", "retrieve", "recall", "remember", "forget",
  "schedule", "cancel", "retry", "pause", "resume", "wait", "sleep",
  "grant", "revoke", "rotate", "audit", "log", "report", "notify",
]);

/** Verbs that technically describe an action but tell the model almost nothing. */
const VAGUE_VERBS = new Set([
  "do", "run", "execute", "handle", "process", "manage", "perform",
  "invoke", "call", "use", "make", "operate", "utilize", "utilise",
  "work", "act", "go", "set", "put", "modify", "change", "access",
]);

/** Words that imply the tool mutates state, so annotations matter. */
const DESTRUCTIVE_WORDS = new Set([
  "delete", "remove", "drop", "destroy", "reset", "purge", "kill",
  "terminate", "truncate", "overwrite", "wipe", "clear", "erase",
  "uninstall", "revoke", "deallocate", "flush", "shutdown", "abort",
  "force", "prune", "evict", "invalidate", "rollback", "revert",
]);

/** Words that imply the tool reaches outside the local machine. */
const NETWORK_WORDS = new Set([
  "http", "https", "url", "uri", "web", "webhook", "endpoint", "socket",
  "remote", "download", "upload", "network", "proxy", "curl", "crawl",
  "scrape", "browse", "oauth", "s3", "gcs", "smtp", "sms", "email",
]);

/**
 * Ambiguous words: network only when the tool is not clearly local.
 * "search_files" searches the disk; "search_web" searches the internet.
 */
const NETWORK_WORDS_AMBIGUOUS = new Set(["api", "search", "fetch", "server", "cloud", "request"]);

const SHELL_WORDS = new Set([
  "shell", "bash", "sh", "zsh", "powershell", "cmd", "exec",
  "spawn", "eval", "command", "terminal", "subprocess",
]);

const FS_WORDS = new Set([
  "file", "files", "path", "directory", "dir", "folder", "fs",
  "disk", "read", "write", "save", "load", "rename", "copy", "move",
  "stat", "symlink", "permission", "permissions", "bytes", "utf",
  "cwd", "parent", "basename", "dirname", "glob", "hidden",
]);

/** Split `readFile`, `read_file`, `read-file`, `readFileV2` into words. */
export function splitWords(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
}

export function tokenize(text: string): string[] {
  return splitWords(text).filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function trigrams(s: string): Set<string> {
  const t = `  ${s.toLowerCase().replace(/[^a-z0-9]/g, "")} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

/** Dice coefficient over character trigrams — robust for short identifiers. */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const x of ta) if (tb.has(x)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}

/**
 * Near-synonym groups for the *object* of a tool name.
 *
 * Only genuine synonyms belong here. `path` and `file` name the same kind of
 * thing, so `delete_path` and `delete_file` are interchangeable in practice
 * and a model will pick one at random. `table` and `view` do NOT: they are
 * distinct entities, and `list_tables` vs `list_views` is a perfectly clear
 * pair. Getting this wrong in either direction is the main failure mode of
 * the collision rule, so the groups are deliberately small.
 */
const OBJECT_SYNONYMS: Record<string, string> = {
  // A file, its path, and its containing folder are the same target.
  path: "location", file: "location", files: "location", dir: "location",
  directory: "location", folder: "location", location: "location",
  // A URL and its aliases.
  url: "web", uri: "web", link: "web", href: "web",
  // Payload words.
  text: "content", string: "content", content: "content", body: "content",
  // Messaging targets.
  message: "msg", email: "msg", mail: "msg", notification: "msg", note: "msg",
};

/** True when two object words are near-synonyms (same kind of thing). */
function sameObjectClass(a: string, b: string): boolean {
  if (a === b) return true;
  const ca = OBJECT_SYNONYMS[a];
  return ca !== undefined && ca === OBJECT_SYNONYMS[b];
}
/**
 * Would an LLM plausibly pick the wrong one of these two tools?
 *
 * Character trigrams alone are the wrong signal: `read_text_file` and
 * `read_file_bytes` share only 44% of their trigrams, yet a model will
 * absolutely confuse them, while `read_file` and `write_file` share 32% and
 * are trivially distinguishable.
 *
 * What actually causes misselection is **same verb, overlapping object**:
 * the model knows it must read something, and both tools are readers.
 * So we key on the leading verb plus the object nouns.
 *
 * One refinement: when the objects share only a head noun and the naming
 * words on both sides are action verbs (`run_select_query` vs
 * `run_write_query`), the pair is distinguishable — see the compound-noun
 * branch below.
 */
export function confusability(a: string, b: string): number {
  if (a === b) return 0;
  const wa = splitWords(a);
  const wb = splitWords(b);
  if (wa.length === 0 || wb.length === 0) return 0;

  // Near-identical spellings (`readFile` vs `read_file`) are always confusing.
  const tri = trigramSimilarity(a, b);
  if (tri >= 0.85) return 1;

  const sameVerb = wa[0] === wb[0];
  const objA = wa.slice(1).filter((w) => !STOP_WORDS.has(w));
  const objB = wb.slice(1).filter((w) => !STOP_WORDS.has(w));

  if (sameVerb) {
    // Same verb means the model already knows *what kind of action* it needs;
    // the only question left is which object.
    if (objA.length === 0 || objB.length === 0) {
      // One side is a bare verb (`get` vs `get_url`): ambiguous, not identical.
      return 0.45;
    }
    // Same verb + objects in the same semantic class = genuinely confusable,
    // regardless of spelling: `delete_path` vs `delete_file`.
    const sharedClass = objA.some((a) => objB.some((b) => a !== b && sameObjectClass(a, b)));
    if (sharedClass) return 0.75;

    const sharedWord = objA.some((w) => objB.includes(w));
    if (sharedWord) {
      // Compound-noun disambiguation. The shared word is the head noun
      // (`query` in `run_select_query` / `run_write_query`) and the differing
      // words are what actually names the tool. When *both* sides differ only
      // by strong action verbs (select vs write), the modifier carries the
      // semantics and the pair is distinguishable. When the differing words
      // are format/noun words (`text` vs `bytes` in `read_text_file` /
      // `read_file_bytes`) or a version suffix (`v2`), they do not separate
      // the pair and it stays confusable.
      const diffA = objA.filter((w) => !objB.includes(w));
      const diffB = objB.filter((w) => !objA.includes(w));
      const distinguishedByVerb =
        diffA.length > 0 &&
        diffB.length > 0 &&
        diffA.every((w) => isActionVerb(w)) &&
        diffB.every((w) => isActionVerb(w));
      return distinguishedByVerb ? 0.5 : 0.75;
    }
    // Same verb, different object classes: distinguishable by object alone,
    // but the shared verb still leaves some room for error.
    // `list_tables` vs `list_views` -> 0.50, below the 0.6 threshold.
    return 0.5;
  }

  // Different verbs are distinguishable even when the object is shared.
  return jaccard([...wa], [...wb]) * 0.6 + tri * 0.2;
}

/** Convenience predicate with the threshold used by the ambiguity rules. */
export function areConfusable(a: string, b: string): boolean {
  return confusability(a, b) >= 0.6;
}

export function firstWord(name: string): string {
  return splitWords(name)[0] ?? "";
}

export function startsWithVerb(name: string): boolean {
  const w = firstWord(name);
  return STRONG_VERBS.has(w) || VAGUE_VERBS.has(w);
}

export function isVagueVerb(word: string): boolean {
  return VAGUE_VERBS.has(word);
}

export function hasStrongVerb(name: string): boolean {
  return splitWords(name).some((w) => STRONG_VERBS.has(w));
}

/**
 * True when a single word names an action rather than a thing. Used by
 * `confusability` to tell compound nouns apart: `select` and `write` in
 * `run_select_query` / `run_write_query` are verbs, while `text` and `bytes`
 * in `read_text_file` / `read_file_bytes` are format nouns.
 */
export function isActionVerb(word: string): boolean {
  return STRONG_VERBS.has(word);
}

export function containsDestructiveWord(name: string, description = ""): boolean {
  const words = [...splitWords(name), ...splitWords(description)];
  return words.some((w) => DESTRUCTIVE_WORDS.has(w));
}

/**
 * Verbs that imply the tool itself performs network egress. A protocol noun
 * in the tool *name* (`clear_http_cache`) says which domain the tool operates
 * on, not that the call reaches the internet; it only counts as evidence when
 * the name also says the tool sends or receives (`fetch_url`, `download_file`,
 * `search_web`).
 */
const EGRESS_VERBS = new Set([
  "fetch", "get", "request", "send", "post", "put", "upload", "download",
  "call", "query", "search", "browse", "crawl", "scrape", "poll", "stream",
  "connect", "ping", "sync",
]);

export function containsNetworkWord(name: string, description = ""): boolean {
  const nameWords = splitWords(name);
  const descWords = splitWords(description);
  const words = [...nameWords, ...descWords];
  // Network words in the *description* are always evidence.
  if (descWords.some((w) => NETWORK_WORDS.has(w))) return true;
  // Network words in the *name* are evidence only with an egress verb.
  if (nameWords.some((w) => NETWORK_WORDS.has(w)) && nameWords.some((w) => EGRESS_VERBS.has(w))) {
    return true;
  }
  // Ambiguous verbs only count when nothing local is in play.
  const local = words.some((w) => FS_WORDS.has(w));
  return !local && words.some((w) => NETWORK_WORDS_AMBIGUOUS.has(w));
}

export function containsShellWord(name: string, description = ""): boolean {
  const words = [...splitWords(name), ...splitWords(description)];
  return words.some((w) => SHELL_WORDS.has(w));
}

export function containsFsWord(name: string, description = ""): boolean {
  const words = [...splitWords(name), ...splitWords(description)];
  return words.some((w) => FS_WORDS.has(w));
}

/** Detect naming convention so we can flag a server that mixes them. */
export function namingConvention(name: string): "snake" | "camel" | "kebab" | "pascal" | "single" {
  if (!/[A-Z_\-]/.test(name)) return "single";
  if (name.includes("_")) return "snake";
  if (name.includes("-")) return "kebab";
  if (/^[A-Z]/.test(name)) return "pascal";
  return "camel";
}

const GENERIC_PHRASES = [
  "this tool",
  "a tool for",
  "this function",
  "tool that",
  "function that",
  "performs the",
  "does the",
  "used to",
  "allows you to",
  "helper",
  "utility",
  "various",
  "things",
  "stuff",
];

/**
 * Match generic filler as whole words/phrases, not substrings.
 * ("metadata" must not trip on "data", "sometimes" must not trip on "some".)
 */
export function genericPhraseHits(description: string): string[] {
  const d = description.toLowerCase();
  return GENERIC_PHRASES.filter((p) => {
    const re = new RegExp(`(^|[^a-z0-9])${p.replace(/ /g, "\\s+")}([^a-z0-9]|$)`);
    return re.test(d);
  });
}

/**
 * Remove references to sibling tools before analyzing a description.
 * "use search_files for that" is guidance, not a claim that this tool
 * reaches the network.
 */
export function stripSiblingMentions(description: string, siblingNames: string[]): string {
  let d = description;
  for (const name of siblingNames) {
    d = d.replaceAll(name, " ");
    d = d.replaceAll(name.replace(/_/g, " "), " ");
  }
  return d;
}

/**
 * Does the description say *when* to use this tool rather than a sibling?
 * Cue phrases are cheap but surprisingly predictive.
 */
const USAGE_CUES = [
  "use this when",
  "use when",
  "use it to",
  "use this to",
  "use this for",
  "use this instead",
  "call this when",
  "invoke when",
  "when you need",
  "when the user",
  "if you want to",
  "for example",
  "e.g.",
  "do not use",
  "instead",
  "not for",
  "prefer ",
  "only when",
  "rather than",
  "as opposed to",
];

export function hasUsageCue(description: string): boolean {
  const d = description.toLowerCase();
  return USAGE_CUES.some((c) => d.includes(c));
}

/** Crude sentence count — enough to reject one-line descriptions. */
export function sentenceCount(description: string): number {
  const parts = description
    .split(/[.!?]\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.length;
}

export function mentionsParam(description: string, param: string): boolean {
  const d = description.toLowerCase();
  // Match `max_bytes`, `maxBytes`, and "max bytes" alike.
  const variants = new Set<string>([
    param.toLowerCase(),
    param.toLowerCase().replace(/_/g, ""),
    param.toLowerCase().replace(/_/g, " "),
    splitWords(param).join(""),
    splitWords(param).join(" "),
  ]);
  for (const v of variants) {
    if (v.length >= 3 && d.includes(v)) return true;
  }
  return false;
}

/** "x", "id", "n", "val" — names an LLM cannot reason about. */
export function isUselessParamName(name: string): boolean {
  if (name.length <= 1) return true;
  return new Set(["id", "data", "value", "val", "obj", "object", "item", "args", "arg", "input", "params", "options", "config", "tmp", "temp", "str", "num"]).has(name.toLowerCase());
}

export function isBooleanish(schemaType: string | string[] | undefined): boolean {
  return schemaType === "boolean" || (Array.isArray(schemaType) && schemaType.includes("boolean"));
}
