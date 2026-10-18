# Origem e dependências

Este repositório nasce de uma especificação funcional original do ecossistema Radar.
A auditoria do GitNexus em 18/10/2026 foi referência de produto/arquitetura. Nenhum
parser, fixture, grafo, banco ou módulo do GitNexus foi incorporado. Não é um fork
renomeado e não reivindica direitos sobre software ou marcas de terceiros.
A política preparatória evolui o protótipo original Radar de 28 testes; a camada
revisada tem 39 testes. Não há alegação de clean room formal.

Dependência de execução Node: `typescript@5.8.3`, Apache-2.0, fixada com integridade
em `package-lock.json`. Apenas `createSourceFile` e travessia de AST são usados;
nenhum programa/compilação do alvo, tsconfig, plugin ou resolução de import é carregado.
Python 3.12+ é um runtime externo; o worker usa `ast` da biblioteca padrão.

A formatação inicial dos novos arquivos MJS foi produzida com Prettier 3.5.3
como ferramenta de desenvolvimento pontual, fora das dependências do produto.
Os relatórios em `docs/evidence/` são saídas geradas, não implementação autoral do
código-fonte analisado. Preservam nome do repositório e commit. Snapshots completos,
fontes de terceiros e node_modules não são versionados.

Referências de API consultadas:
- https://docs.github.com/en/rest/git/trees
- https://docs.github.com/en/rest/git/blobs
- https://docs.python.org/3/library/ast.html
- https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API

O objeto de commit/root-tree é obtido pela API GitHub HTTPS. Árvores e blobs são
recalculados. Não verificamos assinatura de commit; o digest do snapshot não é uma
assinatura e só protege contra alterações quando comparado com âncora independente.
