import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  confusability,
  firstWord,
  genericPhraseHits,
  jaccard,
  mentionsParam,
  namingConvention,
  splitWords,
  stripSiblingMentions,
  tokenize,
  trigramSimilarity,
} from "../src/text.ts";

test("splitWords handles snake, camel, kebab, and pascal", () => {
  assert.deepEqual(splitWords("read_file"), ["read", "file"]);
  assert.deepEqual(splitWords("readFile"), ["read", "file"]);
  assert.deepEqual(splitWords("read-file"), ["read", "file"]);
  assert.deepEqual(splitWords("ReadFile"), ["read", "file"]);
  assert.deepEqual(splitWords("HTTPGet"), ["http", "get"]);
  assert.deepEqual(splitWords("readFileV2"), ["read", "file", "v2"]);
});

test("splitWords drops empty segments", () => {
  assert.deepEqual(splitWords("__a__b__"), ["a", "b"]);
  assert.deepEqual(splitWords(""), []);
});

test("tokenize removes stop words and single chars", () => {
  const t = tokenize("Read a file from the disk");
  assert.ok(!t.includes("a"));
  assert.ok(!t.includes("the"));
  assert.ok(t.includes("read"));
  assert.ok(t.includes("file"));
});

test("jaccard is symmetric and bounded", () => {
  assert.equal(jaccard(["a", "b"], ["a", "b"]), 1);
  assert.equal(jaccard(["a"], ["b"]), 0);
  assert.equal(jaccard([], ["a"]), 0);
  assert.equal(jaccard(["a", "b"], ["b", "c"]), 1 / 3);
});

test("trigramSimilarity separates near-duplicates from distinct names", () => {
  // `read_file` / `read_file_v2` measure 0.800 exactly; assert on the ordering
  // that matters rather than a magic number.
  assert.ok(trigramSimilarity("read_file", "read_file_v2") > trigramSimilarity("read_file", "write_file"));
  assert.ok(trigramSimilarity("read_file", "read_file_v2") >= 0.8);
  assert.ok(trigramSimilarity("read_file", "write_file") < 0.5);
  assert.ok(trigramSimilarity("list_tables", "list_views") < 0.5);
});

test("confusability keys on same-verb/overlapping-object, not spelling", () => {
  // Same verb, shared object -> confusable, even when spelled differently.
  assert.ok(confusability("read_text_file", "read_file_bytes") >= 0.6);
  assert.ok(confusability("fetch_url", "fetch_url_bytes") >= 0.6);
  assert.ok(confusability("delete_path", "delete_file") >= 0.6);
  assert.ok(confusability("read_file", "read_file_v2") >= 0.6);
  // Same verb, disjoint objects -> distinguishable.
  assert.ok(confusability("list_tables", "list_views") < 0.6);
  // Different verbs -> distinguishable even with a shared object.
  assert.ok(confusability("read_file", "write_file") < 0.6);
  assert.ok(confusability("search_files", "stat_path") < 0.6);
  // A tool is never confusable with itself.
  assert.equal(confusability("read_file", "read_file"), 0);
});

test("genericPhraseHits matches whole phrases, not substrings", () => {
  assert.deepEqual(genericPhraseHits("This tool does things."), ["this tool", "things"]);
  // "metadata" contains "data" but must not be flagged; "data" was removed
  // from the list for exactly this reason.
  assert.deepEqual(genericPhraseHits("Returns file metadata."), []);
  assert.deepEqual(genericPhraseHits("Sometimes it fails."), []);
});

test("mentionsParam accepts snake, camel, and spaced variants", () => {
  assert.ok(mentionsParam("limit the max_bytes to 10", "max_bytes"));
  assert.ok(mentionsParam("limit the maxBytes to 10", "max_bytes"));
  assert.ok(mentionsParam("set the max bytes to 10", "max_bytes"));
  assert.ok(!mentionsParam("read the file", "max_bytes"));
  // Too-short params would match everywhere, so they are ignored.
  assert.ok(!mentionsParam("anything at all", "id"));
});

test("stripSiblingMentions removes tool references", () => {
  const d = "Returns text. Use search_files for that.";
  assert.equal(stripSiblingMentions(d, ["search_files"]).includes("search_files"), false);
  assert.ok(stripSiblingMentions(d, ["search_files"]).includes("Returns text"));
});

test("namingConvention classifies the common styles", () => {
  assert.equal(namingConvention("read_file"), "snake");
  assert.equal(namingConvention("readFile"), "camel");
  assert.equal(namingConvention("read-file"), "kebab");
  assert.equal(namingConvention("ReadFile"), "pascal");
  assert.equal(namingConvention("read"), "single");
});

test("firstWord returns the leading verb", () => {
  assert.equal(firstWord("read_file"), "read");
  assert.equal(firstWord("getURL"), "get");
  assert.equal(firstWord(""), "");
});
