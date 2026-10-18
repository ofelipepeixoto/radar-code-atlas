import { treeHash } from "../src/snapshot.mjs";
import { blobHash } from "../src/contracts.mjs";
export const SCOPE = {
  repository: "fixture/sample",
  repositoryId: 42,
  commit: "a".repeat(40),
};
export const SOURCES = {
  "src/core.py":
    '# café: linhas Unicode\ndef target(value):\n    return value + 1\n\ndef caller():\n    return target(1)\n\ndef shadow(target):\n    return target(2)\n\n# target(99)\nNOTE = "target(100)"\nraise RuntimeError("DO_NOT_EXECUTE")\n',
  "src/client.ts":
    'export function target(value: number) { return value + 1; }\nexport const caller = () => target(1);\n// target(999)\nconst note = "target(999)";\nclass Other { target() { return 0; } }\nfunction dynamic(obj: any, key: string) { return obj[key](); }\nthrow new Error("DO_NOT_EXECUTE");\n',
};
export function fixture(sources = SOURCES) {
  const responses = new Map(),
    root = {};
  for (const [path, value] of Object.entries(sources)) {
    const f = typeof value === "string" ? { text: value } : value;
    const bytes = Buffer.from(f.text),
      sha = blobHash(bytes);
    responses.set(`/repos/fixture/sample/git/blobs/${sha}`, {
      sha,
      encoding: "base64",
      content: bytes.toString("base64"),
      size: bytes.length,
    });
    const parts = path.split("/");
    let node = root;
    for (const part of parts.slice(0, -1)) node = node[part] ??= {};
    node[parts.at(-1)] = {
      sha,
      type: f.type ?? "blob",
      mode: f.mode ?? "100644",
      size: bytes.length,
    };
  }
  function build(node) {
    const tree = Object.entries(node).map(([path, value]) =>
      value.sha
        ? { path, ...value }
        : { path, type: "tree", mode: "040000", sha: build(value) },
    );
    const sha = treeHash(tree);
    responses.set(`/repos/fixture/sample/git/trees/${sha}`, {
      sha,
      tree,
      truncated: false,
    });
    return sha;
  }
  const tree = build(root);
  responses.set("/repos/fixture/sample", {
    id: 42,
    full_name: "fixture/sample",
    private: false,
  });
  responses.set(`/repos/fixture/sample/git/commits/${SCOPE.commit}`, {
    sha: SCOPE.commit,
    tree: { sha: tree },
  });
  const calls = [];
  const request = async (path) => {
    calls.push(path);
    if (!responses.has(path)) throw new Error("UNEXPECTED_REQUEST");
    return structuredClone(responses.get(path));
  };
  return { responses, calls, request };
}
