import { readFileSync, statSync } from "node:fs";
import { acquireSnapshot } from "./snapshot.mjs";
import { createAtlas } from "./atlas.mjs";
import { AtlasError, fail } from "./contracts.mjs";
try {
  const [command, ...args] = process.argv.slice(2);
  let result;
  if (command === "acquire" && [3, 4].includes(args.length)) {
    // Explicit local operator scope. This CLI is not an authenticated remote service.
    const [repository, id, commit, selection] = args;
    if (!/^[1-9][0-9]*$/.test(id)) fail("INVALID_SCOPE");
    result = await acquireSnapshot(
      { repository, repositoryId: Number(id), commit },
      { includePaths: selection ? JSON.parse(selection) : undefined },
    );
  } else if (command === "query" && args.length === 4) {
    const [path, digest, tool, input] = args;
    if (statSync(path).size > 4194304) fail("SNAPSHOT_TOO_LARGE");
    const stored = JSON.parse(readFileSync(path, "utf8"));
    result = createAtlas(stored.snapshot, digest).query(
      tool,
      JSON.parse(input),
    );
  } else
    fail(
      "USAGE: acquire OWNER/REPO ID COMMIT [PATHS_JSON] | query SNAPSHOT_FILE TRUSTED_DIGEST TOOL JSON_ARGS",
    );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      error:
        error instanceof AtlasError ? error.code : "LOCAL_OPERATION_FAILED",
    }),
  );
  process.exitCode = 1;
}
