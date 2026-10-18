/** Parse bytes only. Never create a Program, resolve imports or run target code. */
import ts from "typescript";
let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (Buffer.byteLength(input) > 262144) process.exit(2);
}
try {
  const { path, text } = JSON.parse(input);
  const kind = path.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : path.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : /\.(js|mjs)$/.test(path)
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
  const source = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  if (source.parseDiagnostics.length) throw new Error("syntax");
  const symbols = [],
    calls = [];
  const line = (node) =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  function named(node) {
    if (
      (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) &&
      node.name
    )
      return [node.name.text, "function"];
    if (ts.isClassDeclaration(node) && node.name)
      return [node.name.text, "class"];
    if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name))
      return [node.name.text, "method"];
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer))
    )
      return [node.name.text, "function"];
    return null;
  }
  function visit(node, owner = null) {
    const declaration = named(node);
    if (declaration) {
      const [name, kind] = declaration;
      const key = `${node.pos}:${name}`;
      symbols.push({
        key,
        name,
        kind,
        startLine: line(node),
        endLine:
          source.getLineAndCharacterOfPosition(
            Math.max(node.getStart(source), node.end - 1),
          ).line + 1,
      });
      owner = key;
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const expr = node.expression;
      const terminal = ts.isIdentifier(expr)
        ? expr.text
        : ts.isPropertyAccessExpression(expr)
          ? expr.name.text
          : null;
      calls.push({
        owner,
        terminal,
        callee: terminal ? expr.getText(source).slice(0, 160) : "<dynamic>",
        line: line(node),
      });
    }
    if (symbols.length > 2000 || calls.length > 4000) throw new Error("limit");
    ts.forEachChild(node, (child) => visit(child, owner));
  }
  visit(source);
  process.stdout.write(
    JSON.stringify({ parser: "typescript-5.8.3-syntax", symbols, calls }),
  );
} catch {
  process.stdout.write(JSON.stringify({ error: "PARSE_FAILED" }));
}
