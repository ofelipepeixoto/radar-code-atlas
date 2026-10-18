import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createAtlas } from "../src/atlas.mjs";
import { acquireSnapshot } from "../src/snapshot.mjs";
import { fixture, SCOPE, SOURCES } from "./fixtures.mjs";
const p = await acquireSnapshot(SCOPE, { request: fixture().request });
const report = createAtlas(p.snapshot, p.digest).query("source_excerpt", {
  sourcePath: "src/core.py",
  startLine: 1,
  endLine: 3,
});
const script = `import importlib.util,json,sys\nspec=importlib.util.spec_from_file_location('consumer','adapters/security_workbench.py')\nm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nx=json.load(sys.stdin)\ntry:\n print(json.dumps(m.consume_context(x['report'],x['scope'],x['digest'],lambda path: x['sources'][path].encode('utf-8'))))\nexcept Exception:\n print('REJECTED')\n sys.exit(1)\n`;
function consume(r, scope = SCOPE, sources = SOURCES, digest = p.digest) {
  return spawnSync("python3", ["-I", "-c", script], {
    input: JSON.stringify({ report: r, scope, sources, digest }),
    encoding: "utf8",
    timeout: 10000,
    maxBuffer: 65536,
    env: { PATH: process.env.PATH, LANG: "C.UTF-8" },
  });
}
test("Workbench consumer checks evidence without creating finding", () => {
  const r = consume(report);
  assert.equal(r.status, 0, r.stderr);
  const x = JSON.parse(r.stdout);
  assert.equal(x.findingCreated, false);
  assert.equal(x.citations.length, 1);
  assert.equal(x.reviewState, "unreviewed");
});
for (const [name, mutate] of [
  ["scope", (r) => (r.scope.repositoryId = 43)],
  ["digest", (r) => (r.snapshotDigest = "b".repeat(64))],
  ["text", (r) => (r.data.evidence.text = "forged")],
  ["line", (r) => (r.data.evidence.startLine = 2)],
  ["path", (r) => (r.data.evidence.path = "../passwd.py")],
  ["source hash", (r) => (r.data.evidence.sourceSha256 = "0".repeat(64))],
  ["blob", (r) => (r.data.evidence.blobSha = "a".repeat(40))],
  ["boolean line", (r) => (r.data.evidence.startLine = true)],
  ["write", (r) => (r.tool = "rename")],
])
  test(`consumer rejects ${name}`, () => {
    const copy = structuredClone(report);
    mutate(copy);
    assert.equal(consume(copy).status, 1);
  });
test("consumer rejects changed trusted bytes", () =>
  assert.equal(
    consume(report, SCOPE, { ...SOURCES, "src/core.py": "changed" }).status,
    1,
  ));
test("consumer ignores malicious report link and regenerates canonical URL", () => {
  const copy = structuredClone(report);
  copy.data.evidence.url = "https://evil.test";
  const r = consume(copy);
  assert.equal(r.status, 0);
  assert.ok(
    JSON.parse(r.stdout).citations[0].url.startsWith(
      "https://github.com/fixture/sample/blob/",
    ),
  );
});
