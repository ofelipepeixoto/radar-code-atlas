import test from "node:test";
import assert from "node:assert/strict";
import https from "node:https";
import { EventEmitter } from "node:events";
import { githubJson } from "../src/github.mjs";
function mock(status, chunks, check = () => {}) {
  const original = https.request;
  https.request = (options, cb) => {
    check(options);
    const req = new EventEmitter();
    req.end = () =>
      queueMicrotask(() => {
        const res = new EventEmitter();
        res.statusCode = status;
        res.resume = () => {};
        cb(res);
        for (const chunk of chunks) res.emit("data", Buffer.from(chunk));
        res.emit("end");
        req.emit("close");
      });
    req.destroy = (e) => {
      req.emit("error", e);
      req.emit("close");
    };
    return req;
  };
  return () => {
    https.request = original;
  };
}
for (const p of [
  "https://evil.test",
  "/repos/x/y?token=secret",
  "/repos/x/y/../../secret",
  "/repos/x/y/git/trees/main",
  "/repos/x/y/git/blobs/abc",
  "/users/test",
])
  test(`transport denies ${p}`, () =>
    assert.throws(() => githubJson(p), /INVALID_API_PATH/));
test("fixed HTTPS host and GET", async () => {
  const restore = mock(200, ['{"ok":true}'], (o) => {
    assert.equal(o.hostname, "api.github.com");
    assert.equal(o.port, 443);
    assert.equal(o.method, "GET");
  });
  try {
    assert.deepEqual(await githubJson("/repos/x/y"), { ok: true });
  } finally {
    restore();
  }
});
for (const status of [302, 403, 404, 429, 500])
  test(`HTTP ${status} never follows or retries`, async () => {
    let n = 0;
    const restore = mock(status, ["secret-provider-body"], () => n++);
    try {
      await assert.rejects(
        () => githubJson("/repos/x/y"),
        new RegExp(`GITHUB_HTTP_${status}`),
      );
      assert.equal(n, 1);
    } finally {
      restore();
    }
  });
test("malformed API JSON", async () => {
  const restore = mock(200, ["not json"]);
  try {
    await assert.rejects(() => githubJson("/repos/x/y"), /INVALID_API_JSON/);
  } finally {
    restore();
  }
});
test("bounded API response", async () => {
  const restore = mock(200, ["x".repeat(2097153)]);
  try {
    await assert.rejects(() => githubJson("/repos/x/y"), /RESPONSE_TOO_LARGE/);
  } finally {
    restore();
  }
});
