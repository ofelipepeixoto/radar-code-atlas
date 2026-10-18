import { createHash } from "node:crypto";
import { githubJson } from "./github.mjs";
import { isSafeSourcePath } from "./access-policy.mjs";
import {
  SHA,
  DIGEST,
  LIMITS,
  scopeOf,
  sourceEligible,
  sensitiveText,
  hash,
  blobHash,
  fail,
  freeze,
} from "./contracts.mjs";
export function treeHash(entries) {
  const seen = new Set();
  const sorted = [...entries].sort((a, b) =>
    Buffer.compare(
      Buffer.from(a.path + (a.type === "tree" ? "/" : "")),
      Buffer.from(b.path + (b.type === "tree" ? "/" : "")),
    ),
  );
  const pieces = [];
  for (const e of sorted) {
    if (
      typeof e.path !== "string" ||
      !e.path ||
      e.path.includes("/") ||
      e.path.includes("\0") ||
      seen.has(e.path) ||
      !SHA.test(e.sha ?? "")
    )
      fail("INVALID_TREE");
    const modes = {
      tree: ["040000"],
      blob: ["100644", "100755", "120000"],
      commit: ["160000"],
    };
    if (!modes[e.type]?.includes(e.mode)) fail("INVALID_TREE");
    seen.add(e.path);
    pieces.push(
      Buffer.from(`${e.mode === "040000" ? "40000" : e.mode} ${e.path}\0`),
      Buffer.from(e.sha, "hex"),
    );
  }
  const bytes = Buffer.concat(pieces);
  return createHash("sha1")
    .update(`tree ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
}
export function snapshotDigest(snapshot) {
  return hash(JSON.stringify(snapshot));
}
export function validateSnapshot(snapshot, expectedDigest) {
  if (
    typeof expectedDigest !== "string" ||
    !DIGEST.test(expectedDigest) ||
    snapshotDigest(snapshot) !== expectedDigest
  )
    fail("SNAPSHOT_DIGEST_MISMATCH");
  const scope = scopeOf(snapshot.scope);
  if (
    snapshot.schemaVersion !== 1 ||
    !["github-api", "fixture-transport"].includes(snapshot.origin) ||
    !SHA.test(snapshot.treeSha ?? "") ||
    !Array.isArray(snapshot.files) ||
    snapshot.files.length > LIMITS.files ||
    !Array.isArray(snapshot.omissions) ||
    snapshot.omissions.length > LIMITS.entries + LIMITS.files + 1
  )
    fail("INVALID_SNAPSHOT");
  const seen = new Set();
  let total = 0;
  for (const f of snapshot.files) {
    if (
      !sourceEligible(f.path) ||
      seen.has(f.path) ||
      typeof f.text !== "string" ||
      !SHA.test(f.blobSha ?? "") ||
      !DIGEST.test(f.sha256 ?? "")
    )
      fail("INVALID_SOURCE");
    seen.add(f.path);
    const bytes = Buffer.from(f.text);
    total += bytes.length;
    if (
      bytes.length > LIMITS.fileBytes ||
      total > LIMITS.bytes ||
      blobHash(bytes) !== f.blobSha ||
      hash(bytes) !== f.sha256
    )
      fail("SOURCE_HASH_MISMATCH");
    if (
      sensitiveText(f.text) ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(f.text)
    )
      fail("SOURCE_REJECTED");
  }
  return freeze({ ...snapshot, scope });
}
export async function acquireSnapshot(
  input,
  { request = githubJson, includePaths } = {},
) {
  if (
    includePaths !== undefined &&
    (!Array.isArray(includePaths) ||
      !includePaths.length ||
      includePaths.length > LIMITS.files ||
      includePaths.some((p) => !sourceEligible(p)) ||
      new Set(includePaths).size !== includePaths.length)
  )
    fail("INVALID_PATH_SELECTION");
  const scope = scopeOf(input),
    base = `/repos/${scope.repository}`;
  let requests = 0,
    entryCount = 0,
    total = 0,
    traversalComplete = true;
  const get = async (path) => {
    if (++requests > LIMITS.requests) fail("REQUEST_BUDGET_EXCEEDED");
    return request(path);
  };
  const repo = await get(base);
  if (repo.id !== scope.repositoryId || repo.full_name !== scope.repository)
    fail("REPOSITORY_IDENTITY_MISMATCH");
  if (repo.private !== false) fail("PUBLIC_REPOSITORY_REQUIRED");
  const commit = await get(`${base}/git/commits/${scope.commit}`);
  if (commit.sha !== scope.commit || !SHA.test(commit.tree?.sha ?? ""))
    fail("COMMIT_MISMATCH");
  const files = [],
    omissions = [],
    queue = [{ sha: commit.tree.sha, prefix: "", depth: 0 }];
  const omit = (path, reason) =>
    omissions.push({
      path:
        typeof path === "string" &&
        path.length <= 512 &&
        !/[\x00-\x1f\x7f]/.test(path)
          ? path
          : "<invalid-path>",
      reason,
    });
  while (queue.length) {
    const item = queue.shift();
    if (requests >= LIMITS.requests) {
      omit(item.prefix, "request_budget");
      traversalComplete = false;
      break;
    }
    const tree = await get(`${base}/git/trees/${item.sha}`);
    if (
      tree.sha !== item.sha ||
      tree.truncated !== false ||
      !Array.isArray(tree.tree)
    )
      fail("TREE_INCOMPLETE");
    if (tree.tree.length + entryCount > LIMITS.entries)
      fail("TREE_ENTRY_LIMIT");
    if (treeHash(tree.tree) !== item.sha) fail("TREE_HASH_MISMATCH");
    entryCount += tree.tree.length;
    for (const e of [...tree.tree].sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    )) {
      const path = item.prefix + e.path;
      if (
        !isSafeSourcePath(path) ||
        path
          .split("/")
          .some(
            (p) =>
              p.startsWith(".") ||
              [
                "node_modules",
                "vendor",
                "dist",
                "build",
                "venv",
                "__pycache__",
              ].includes(p.toLowerCase()),
          )
      ) {
        omit(path, "excluded_path");
        continue;
      }
      if (e.type === "tree") {
        if (item.depth >= 15) omit(path, "depth_limit");
        else
          queue.push({ sha: e.sha, prefix: path + "/", depth: item.depth + 1 });
        continue;
      }
      if (e.type !== "blob" || !["100644", "100755"].includes(e.mode)) {
        omit(path, "non_regular");
        continue;
      }
      if (!sourceEligible(path)) {
        omit(path, "unsupported_extension");
        continue;
      }
      if (includePaths && !includePaths.includes(path)) {
        omit(path, "not_selected");
        continue;
      }
      if (files.length >= LIMITS.files) {
        omit(path, "file_limit");
        continue;
      }
      if (!Number.isSafeInteger(e.size) || e.size < 0)
        fail("INVALID_BLOB_SIZE");
      if (e.size > LIMITS.fileBytes || total + e.size > LIMITS.bytes) {
        omit(path, "size_limit");
        continue;
      }
      if (requests >= LIMITS.requests) {
        omit(path, "request_budget");
        continue;
      }
      const blob = await get(`${base}/git/blobs/${e.sha}`);
      if (
        blob.sha !== e.sha ||
        blob.encoding !== "base64" ||
        typeof blob.content !== "string" ||
        blob.content.length > LIMITS.fileBytes * 2
      )
        fail("INVALID_BLOB");
      const encoded = blob.content.replace(/[\r\n]/g, "");
      if (
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          encoded,
        )
      )
        fail("INVALID_BASE64");
      const bytes = Buffer.from(encoded, "base64");
      if (
        bytes.length !== blob.size ||
        bytes.length !== e.size ||
        blobHash(bytes) !== e.sha
      )
        fail("BLOB_HASH_MISMATCH");
      const text = bytes.toString("utf8");
      if (!Buffer.from(text).equals(bytes)) {
        omit(path, "invalid_utf8");
        continue;
      }
      if (
        sensitiveText(text) ||
        /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)
      ) {
        omit(path, "content_rejected");
        continue;
      }
      files.push({ path, blobSha: e.sha, sha256: hash(bytes), text });
      total += bytes.length;
    }
  }
  if (includePaths)
    for (const path of includePaths)
      if (
        !files.some((f) => f.path === path) &&
        !omissions.some((o) => o.path === path)
      )
        omit(path, "requested_path_not_found");
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const snapshot = {
    schemaVersion: 1,
    scope,
    origin: request === githubJson ? "github-api" : "fixture-transport",
    treeSha: commit.tree.sha,
    files,
    omissions,
    coverage: {
      filesRead: files.length,
      bytesRead: total,
      entriesObserved: entryCount,
      requests,
      partial: omissions.length > 0 || queue.length > 0,
      treeTraversalComplete: traversalComplete && queue.length === 0,
    },
  };
  const digest = snapshotDigest(snapshot);
  return { snapshot: validateSnapshot(snapshot, digest), digest };
}
