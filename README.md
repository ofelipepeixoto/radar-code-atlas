# Radar Code Atlas
Componente **experimental e autoral de Carlos Felipe** para consultas de código com fonte, commit e limites explícitos. Não é fork nem distribuição do GitNexus.

## Primeira camada — política e contrato
Cinco consultas somente leitura: `repo_summary`, `search_symbols`, `symbol_context`, `impact_preview`, `source_excerpt`.
A política fixa usuário, ID de repositório e commit. O verificador criptográfico é injetado; os testes usam identidades fictícias. Não há OAuth real ou endpoint remoto nesta camada.

```sh
npm run check
npm test
```
Node.js 22+, sem dependências nesta camada. Próxima camada: aquisição e parsing limitados por snapshot e exportação para revisão pelo Security Workbench.

## Origem e limites
A política é uma evolução do protótipo original entregue na auditoria de 18/10/2026. Nenhum parser, fixture, grafo ou código GitNexus foi copiado. MIT se aplica exclusivamente ao código original. Não é certificação jurídica de clean room.
Sem implantação, IA paga, bancos, automações ou alteração do MCP WhatsApp. Resultado vazio não prova ausência de dependências ou riscos.
