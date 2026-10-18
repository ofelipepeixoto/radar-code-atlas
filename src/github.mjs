/** HTTPS only; no redirects, checkout, target commands, or token in outputs. */
import https from "node:https";
import { LIMITS, fail, AtlasError } from "./contracts.mjs";
export function githubJson(path) {
  if (
    !/^\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/git\/(?:commits|trees|blobs)\/[0-9a-f]{40})?$/.test(
      path,
    )
  )
    fail("INVALID_API_PATH");
  const token = process.env.GITHUB_TOKEN;
  return new Promise((resolve, reject) => {
    let timer;
    const request = https.request(
      {
        hostname: "api.github.com",
        port: 443,
        path,
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "radar-code-atlas/0.1.0",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new AtlasError(`GITHUB_HTTP_${response.statusCode}`));
          return;
        }
        const chunks = [];
        let size = 0;
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > LIMITS.responseBytes)
            request.destroy(new AtlasError("RESPONSE_TOO_LARGE"));
          else chunks.push(chunk);
        });
        response.on("error", () => reject(new AtlasError("NETWORK_ERROR")));
        response.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new AtlasError("INVALID_API_JSON"));
          }
        });
      },
    );
    timer = setTimeout(
      () => request.destroy(new AtlasError("NETWORK_TIMEOUT")),
      8000,
    );
    request.on("close", () => clearTimeout(timer));
    request.on("error", (error) =>
      reject(
        error instanceof AtlasError ? error : new AtlasError("NETWORK_ERROR"),
      ),
    );
    request.end();
  });
}
