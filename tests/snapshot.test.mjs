import test from "node:test";
import assert from "node:assert/strict";
import {
  acquireSnapshot,
  validateSnapshot,
  snapshotDigest,
  treeHash,
} from "../src/snapshot.mjs";
import { scopeOf, sourceEligible, sensitiveText } from "../src/contracts.mjs";
import { fixture, SCOPE } from "./fixtures.mjs";
const get = async (sources) => {
  const f = fixture(sources);
  return {
    ...(await acquireSnapshot(SCOPE, { request: f.request })),
    fixture: f,
  };
};
test("pinned tree and blob acquisition is reproducible", async () => {
  const a = await get(),
    b = await get();
  assert.equal(a.digest, b.digest);
  assert.equal(a.snapshot.files.length, 2);
  assert.equal(a.snapshot.origin, "fixture-transport");
  assert.ok(Object.isFrozen(a.snapshot.files[0]));
});
for (const field of ["id", "full_name", "private"])
  test(`reject repository ${field}`, async () => {
    const f = fixture();
    f.responses.get("/repos/fixture/sample")[field] =
      field === "id" ? 43 : field === "private" ? true : "other/sample";
    await assert.rejects(
      () => acquireSnapshot(SCOPE, { request: f.request }),
      /REPOSITORY_IDENTITY|PUBLIC_REPOSITORY/,
    );
  });
test("reject commit substitution", async () => {
  const f = fixture();
  f.responses.get(`/repos/fixture/sample/git/commits/${SCOPE.commit}`).sha =
    "b".repeat(40);
  await assert.rejects(
    () => acquireSnapshot(SCOPE, { request: f.request }),
    /COMMIT_MISMATCH/,
  );
});
test("reject truncated tree", async () => {
  const f = fixture();
  for (const [k, v] of f.responses)
    if (k.includes("/trees/")) v.truncated = true;
  await assert.rejects(
    () => acquireSnapshot(SCOPE, { request: f.request }),
    /TREE_INCOMPLETE/,
  );
});
test("reject forged tree relationship", async () => {
  const f = fixture();
  for (const [k, v] of f.responses)
    if (k.includes("/trees/")) v.tree[0].sha = "b".repeat(40);
  await assert.rejects(
    () => acquireSnapshot(SCOPE, { request: f.request }),
    /TREE_HASH_MISMATCH/,
  );
});
test("reject altered blob", async () => {
  const f = fixture();
  for (const [k, v] of f.responses)
    if (k.includes("/blobs/"))
      v.content = Buffer.from("changed").toString("base64");
  await assert.rejects(
    () => acquireSnapshot(SCOPE, { request: f.request }),
    /BLOB_HASH_MISMATCH/,
  );
});
test("reject malformed base64", async () => {
  const f = fixture();
  for (const [k, v] of f.responses)
    if (k.includes("/blobs/")) v.content = "!!!!";
  await assert.rejects(
    () => acquireSnapshot(SCOPE, { request: f.request }),
    /INVALID_BASE64/,
  );
});
test("symlinks and secret paths not fetched", async () => {
  const { snapshot, fixture: f } = await get({
    "good.py": "def ok(): pass\n",
    "link.py": { text: "/etc/passwd", mode: "120000" },
    ".env": "sensitive",
    "a.pem": "private",
  });
  assert.deepEqual(
    snapshot.files.map((f) => f.path),
    ["good.py"],
  );
  assert.equal(f.calls.filter((x) => x.includes("/blobs/")).length, 1);
  assert.equal(snapshot.coverage.partial, true);
});
test("unsupported files declared", async () => {
  const { snapshot } = await get({ "README.md": "hello" });
  assert.equal(snapshot.omissions[0].reason, "unsupported_extension");
});
test("content secret rejected without storing value", async () => {
  const secret = "example_sensitive_literal_12345";
  const { snapshot } = await get({ "config.py": `password = "${secret}"` });
  assert.equal(snapshot.files.length, 0);
  assert.ok(!JSON.stringify(snapshot).includes(secret));
});
test("file cap is explicit", async () => {
  const sources = Object.fromEntries(
    Array.from({ length: 22 }, (_, i) => [`f${i}.py`, "def f(): pass"]),
  );
  const { snapshot } = await get(sources);
  assert.equal(snapshot.files.length, 20);
  assert.equal(snapshot.coverage.partial, true);
});
test("oversized source not fetched", async () => {
  const { snapshot, fixture: f } = await get({
    "large.py": "a".repeat(131073),
  });
  assert.equal(snapshot.files.length, 0);
  assert.equal(f.calls.filter((x) => x.includes("/blobs/")).length, 0);
});
test("digest anchor required", async () => {
  const { snapshot } = await get();
  assert.throws(() => validateSnapshot(snapshot, ""), /DIGEST_MISMATCH/);
});
test("offline tamper rejected", async () => {
  const { snapshot, digest } = await get();
  const copy = structuredClone(snapshot);
  copy.files[0].text += "\n# forged";
  assert.throws(() => validateSnapshot(copy, digest), /DIGEST_MISMATCH/);
});
test("rehashed envelope cannot conceal broken blob identity", async () => {
  const { snapshot } = await get();
  const copy = structuredClone(snapshot);
  copy.files[0].text += "\n# forged";
  assert.throws(
    () => validateSnapshot(copy, snapshotDigest(copy)),
    /SOURCE_HASH_MISMATCH/,
  );
});
test("duplicate source rejected", async () => {
  const { snapshot } = await get();
  const copy = structuredClone(snapshot);
  copy.files.push(copy.files[0]);
  assert.throws(
    () => validateSnapshot(copy, snapshotDigest(copy)),
    /INVALID_SOURCE/,
  );
});
test("tree duplicate entry rejected", () => {
  const e = { path: "x", sha: "a".repeat(40), mode: "100644", type: "blob" };
  assert.throws(() => treeHash([e, e]), /INVALID_TREE/);
});
for (const change of [
  { commit: "main" },
  { repositoryId: true },
  { repository: "x/../../x" },
  { repository: "x/.." },
  { repository: "https://evil.test/r" },
  { commit: "a".repeat(39) },
])
  test(`invalid scope ${JSON.stringify(change)}`, () =>
    assert.throws(() => scopeOf({ ...SCOPE, ...change }), /INVALID_SCOPE/));
for (const p of [
  ".github/a.ts",
  "node_modules/a.js",
  "../a.py",
  "file%20.py",
  "dist/a.js",
  "a.key",
  "foo/.ENV/x.py",
])
  test(`excluded path ${p}`, () => assert.equal(sourceEligible(p), false));
test("ordinary env reference is not secret literal", () =>
  assert.equal(sensitiveText("const token = process.env.TOKEN;"), false));
test("explicit path selection produces partial scoped acquisition", async () => {
  const f = fixture();
  const p = await acquireSnapshot(SCOPE, {
    request: f.request,
    includePaths: ["src/core.py"],
  });
  assert.deepEqual(
    p.snapshot.files.map((f) => f.path),
    ["src/core.py"],
  );
  assert.equal(p.snapshot.coverage.partial, true);
});
test("selection cannot escape source policy", async () => {
  const f = fixture();
  await assert.rejects(
    () =>
      acquireSnapshot(SCOPE, { request: f.request, includePaths: ["../x"] }),
    /INVALID_PATH_SELECTION/,
  );
});
test("missing requested source is explicitly reported", async () => {
  const f = fixture();
  const p = await acquireSnapshot(SCOPE, {
    request: f.request,
    includePaths: ["src/missing.py"],
  });
  assert.equal(p.snapshot.files.length, 0);
  assert.ok(
    p.snapshot.omissions.some(
      (x) =>
        x.path === "src/missing.py" && x.reason === "requested_path_not_found",
    ),
  );
});
