"""Original AST-only parser. This script never imports or executes target code."""
import ast
import json
import sys
try:
    import resource
    resource.setrlimit(resource.RLIMIT_CPU, (3, 3))
    resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
except (ImportError, ValueError):
    pass

try:
    data = json.loads(sys.stdin.read(262145))
    tree = ast.parse(data['text'], filename='<snapshot>', type_comments=True)
    symbols, calls = [], []
    class Visitor(ast.NodeVisitor):
        owner = None
        def declaration(self, node, kind):
            prior = self.owner
            key = f'{node.lineno}:{node.col_offset}:{node.name}'
            symbols.append(dict(key=key, name=node.name, kind=kind, startLine=node.lineno, endLine=node.end_lineno))
            self.owner = key
            self.generic_visit(node)
            self.owner = prior
        def visit_FunctionDef(self, node):
            self.declaration(node, 'function')
        visit_AsyncFunctionDef = visit_FunctionDef
        def visit_ClassDef(self, node):
            self.declaration(node, 'class')
        def visit_Call(self, node):
            terminal = node.func.id if isinstance(node.func, ast.Name) else node.func.attr if isinstance(node.func, ast.Attribute) else None
            calls.append(dict(owner=self.owner, terminal=terminal, callee=terminal or '<dynamic>', line=node.lineno))
            self.generic_visit(node)
    Visitor().visit(tree)
    if len(symbols) > 2000 or len(calls) > 4000:
        raise ValueError('limit')
    print(json.dumps(dict(parser='python-ast-syntax', symbols=symbols, calls=calls)))
except (Exception, RecursionError):
    print(json.dumps(dict(error='PARSE_FAILED')))
