/** Copyright (c) 2026 Carlos Felipe. MIT. Original snapshot contracts. */
import { createHash } from "node:crypto";
import { isSafeSourcePath } from "./access-policy.mjs";
export const VERSION = "0.1.0-experimental";
export const SHA = /^[a-f0-9]{40}$/;
export const DIGEST = /^[a-f0-9]{64}$/;
export const LIMITS = Object.freeze({
  files: 20,
  entries: 2000,
  bytes: 1048576,
  fileBytes: 131072,
  responseBytes: 2097152,
  requests: 80,
  lines: 60,
  results: 30,
});
export class AtlasError extends Error {
  constructor(code) {
    super(code);
    this.name = "AtlasError";
    this.code = code;
  }
}
export const fail = (code) => {
  throw new AtlasError(code);
};
export const hash = (data) => createHash("sha256").update(data).digest("hex");
export const blobHash = (bytes) =>
  createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
export function scopeOf(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof value.repository !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(
      value.repository,
    ) ||
    /\/(?:\.|\.\.)$/.test(value.repository) ||
    !Number.isSafeInteger(value.repositoryId) ||
    value.repositoryId < 1 ||
    typeof value.commit !== "string" ||
    !SHA.test(value.commit)
  )
    fail("INVALID_SCOPE");
  return Object.freeze({
    repository: value.repository,
    repositoryId: value.repositoryId,
    commit: value.commit,
  });
}
export function sourceEligible(path) {
  return (
    isSafeSourcePath(path) &&
    !path
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
      ) &&
    /\.(?:py|js|jsx|mjs|ts|tsx)$/.test(path)
  );
}
export function sensitiveText(text) {
  // Conservative filter, not a complete secret detector. Never return matches.
  return (
    /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/.test(text) ||
    /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,}|AKIA[A-Z0-9]{16})/.test(
      text,
    ) ||
    /(?:api[_-]?key|access[_-]?token|password|secret)\s*[=:]\s*['"][^'"\r\n]{12,}['"]/i.test(
      text,
    )
  );
}
export function exactKeys(value, keys) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !keys.includes(k))
  )
    fail("INVALID_ARGUMENTS");
}
export function evidence(scope, file, startLine, endLine) {
  if (
    !Number.isSafeInteger(startLine) ||
    !Number.isSafeInteger(endLine) ||
    startLine < 1 ||
    endLine < startLine ||
    endLine > file.text.split("\n").length ||
    endLine - startLine + 1 > LIMITS.lines
  )
    fail("INVALID_LINE_RANGE");
  const text = file.text
    .split("\n")
    .slice(startLine - 1, endLine)
    .join("\n");
  if (Buffer.byteLength(text) > 8192) fail("EXCERPT_TOO_LARGE");
  return {
    ...scope,
    path: file.path,
    blobSha: file.blobSha,
    sourceSha256: file.sha256,
    startLine,
    endLine,
    text,
    excerptSha256: hash(text),
    untrustedSource: true,
    url: `https://github.com/${scope.repository}/blob/${scope.commit}/${file.path.split("/").map(encodeURIComponent).join("/")}#L${startLine}-L${endLine}`,
  };
}
export function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
}
