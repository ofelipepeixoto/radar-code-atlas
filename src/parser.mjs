import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
export function parseSource(file, timeoutMs = 15000) {
  const python = file.path.endsWith(".py");
  const script = fileURLToPath(
    new URL(
      python ? "./parser_worker.py" : "./parser-worker.mjs",
      import.meta.url,
    ),
  );
  const result = spawnSync(
    python ? "python3" : process.execPath,
    python ? ["-I", script] : ["--max-old-space-size=128", script],
    {
      input: JSON.stringify({ path: file.path, text: file.text }),
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 1048576,
      cwd: tmpdir(),
      env: { PATH: process.env.PATH, LANG: "C.UTF-8", PYTHONNOUSERSITE: "1" },
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0)
    return { error: "PARSER_UNAVAILABLE_OR_LIMIT" };
  try {
    const parsed = JSON.parse(result.stdout);
    if (
      parsed.error ||
      !Array.isArray(parsed.symbols) ||
      !Array.isArray(parsed.calls)
    )
      return { error: "PARSE_FAILED" };
    const lines = file.text.split("\n").length;
    if (
      parsed.symbols.some(
        (s) =>
          typeof s.key !== "string" ||
          typeof s.name !== "string" ||
          s.name.length > 128 ||
          !Number.isInteger(s.startLine) ||
          !Number.isInteger(s.endLine) ||
          s.startLine < 1 ||
          s.endLine < s.startLine ||
          s.endLine > lines,
      ) ||
      parsed.calls.some(
        (c) => !Number.isInteger(c.line) || c.line < 1 || c.line > lines,
      )
    )
      return { error: "INVALID_PARSER_OUTPUT" };
    return parsed;
  } catch {
    return { error: "INVALID_PARSER_OUTPUT" };
  }
}
