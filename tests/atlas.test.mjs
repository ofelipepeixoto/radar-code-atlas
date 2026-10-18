import test from "node:test";
import assert from "node:assert/strict";
import { createAtlas, TOOL_NAMES } from "../src/atlas.mjs";
import { acquireSnapshot } from "../src/snapshot.mjs";
import { hash, blobHash } from "../src/contracts.mjs";
import { fixture, SCOPE, SOURCES } from "./fixtures.mjs";
const f = fixture(),
  pack = await acquireSnapshot(SCOPE, { request: f.request });
const atlas = createAtlas(pack.snapshot, pack.digest);
test("five local query operations", () => assert.equal(TOOL_NAMES.length, 5));
test("Python and TS parsed, never executed", () => {
  const r = atlas.query("repo_summary");
  assert.equal(r.coverage.filesParsed, 2);
  assert.equal(r.coverage.parseErrors.length, 0);
  assert.ok(r.data.symbols >= 7);
});
test("homonyms retained not silently selected", () => {
  const r = atlas.query("search_symbols", { query: "target" });
  assert.equal(r.data.total, 3);
  assert.equal(new Set(r.data.items.map((s) => s.id)).size, 3);
});
test("line based Python evidence exact with Unicode", () => {
  const r = atlas.query("search_symbols", { query: "target" });
  const s = r.data.items.find((s) => s.path.endsWith(".py"));
  assert.equal(s.evidence.startLine, 2);
  assert.equal(s.evidence.text, "def target(value):");
  assert.equal(s.evidence.sourceSha256, hash(SOURCES["src/core.py"]));
  assert.equal(
    s.evidence.blobSha,
    blobHash(Buffer.from(SOURCES["src/core.py"])),
  );
});
test("comments and strings are not call sites", () => {
  const id = atlas
    .query("search_symbols", { query: "target" })
    .data.items.find((s) => s.path.endsWith(".py")).id;
  const r = atlas.query("impact_preview", { symbolId: id });
  assert.equal(r.data.total, 3);
  assert.equal(r.data.relation, "syntactic-name-candidate");
  assert.ok(r.data.items.every((i) => i.resolution === "unresolved"));
  assert.ok(
    !r.data.items.some(
      (i) =>
        i.evidence.text.includes("999") ||
        i.evidence.text.includes("100") ||
        i.evidence.text.includes("99)"),
    ),
  );
});
test("context returns lexical calls", () => {
  const s = atlas
    .query("search_symbols", { query: "caller" })
    .data.items.find((s) => s.path.endsWith(".py"));
  const r = atlas.query("symbol_context", { symbolId: s.id });
  assert.equal(r.data.total, 1);
  assert.equal(r.data.items[0].callee, "target");
});
test("excerpt preserves exact source bytes and anchors", () => {
  const r = atlas.query("source_excerpt", {
    sourcePath: "src/core.py",
    startLine: 1,
    endLine: 3,
  });
  assert.equal(
    r.data.evidence.text,
    SOURCES["src/core.py"].split("\n").slice(0, 3).join("\n"),
  );
  assert.equal(r.data.evidence.excerptSha256, hash(r.data.evidence.text));
  assert.ok(r.data.evidence.url.endsWith("#L1-L3"));
});
test("limit declares truncation", () => {
  const r = atlas.query("search_symbols", { query: "target", limit: 1 });
  assert.equal(r.data.truncated, true);
  assert.equal(r.data.items.length, 1);
});
test("not-found does not assert absence", () =>
  assert.ok(
    atlas.query("search_symbols", { query: "missing_name" }).limitations
      .length > 0,
  ));
for (const [tool, args, code] of [
  ["rename", {}, "TOOL_NOT_ALLOWED"],
  ["repo_summary", { url: "https://evil.test" }, "INVALID_ARGUMENTS"],
  [
    "source_excerpt",
    { sourcePath: "../x", startLine: 1, endLine: 1 },
    "SOURCE_UNAVAILABLE",
  ],
  [
    "source_excerpt",
    { sourcePath: "src/core.py", startLine: 0, endLine: 1 },
    "INVALID_LINE_RANGE",
  ],
  [
    "source_excerpt",
    { sourcePath: "src/core.py", startLine: true, endLine: 1 },
    "INVALID_LINE_RANGE",
  ],
  [
    "source_excerpt",
    { sourcePath: "src/core.py", startLine: 3, endLine: 2 },
    "INVALID_LINE_RANGE",
  ],
  [
    "source_excerpt",
    { sourcePath: "src/core.py", startLine: 1, endLine: 999 },
    "INVALID_LINE_RANGE",
  ],
  ["search_symbols", { query: "" }, "INVALID_QUERY"],
  ["search_symbols", { query: "target", limit: 0 }, "INVALID_LIMIT"],
  ["search_symbols", { query: "target", limit: 31 }, "INVALID_LIMIT"],
  [
    "search_symbols",
    { query: "target", accessToken: "x" },
    "INVALID_ARGUMENTS",
  ],
  ["symbol_context", { symbolId: "unknown" }, "SYMBOL_UNAVAILABLE"],
])
  test(`${tool} ${code}`, () =>
    assert.throws(() => atlas.query(tool, args), new RegExp(code)));
test("syntax failure marks coverage partial", async () => {
  const f = fixture({ "broken.py": "def ( invalid" });
  const p = await acquireSnapshot(SCOPE, { request: f.request });
  const r = createAtlas(p.snapshot, p.digest).query("repo_summary");
  assert.equal(r.coverage.partial, true);
  assert.equal(r.coverage.filesParsed, 0);
  assert.equal(r.coverage.parseErrors.length, 1);
});
test("JS parser supports arrow functions", async () => {
  const f = fixture({
    "a.js": "const plus = () => 1;\nfunction run(){return plus();}",
  });
  const p = await acquireSnapshot(SCOPE, { request: f.request });
  const a = createAtlas(p.snapshot, p.digest);
  assert.equal(a.query("search_symbols", { query: "plus" }).data.total, 1);
});
test("a caller cannot mutate a query result or later coverage", () => {
  const r = atlas.query("repo_summary");
  assert.throws(() => {
    r.coverage.partial = false;
  }, TypeError);
  assert.ok(Object.isFrozen(r.coverage));
});
test("CRLF excerpts preserve original characters", async () => {
  const f = fixture({
    "a.py": "# Unicode café\r\ndef f():\r\n    return 1\r\n",
  });
  const p = await acquireSnapshot(SCOPE, { request: f.request });
  const r = createAtlas(p.snapshot, p.digest).query("source_excerpt", {
    sourcePath: "a.py",
    startLine: 1,
    endLine: 2,
  });
  assert.equal(r.data.evidence.text, "# Unicode café\r\ndef f():\r");
});
