# Radar Code Atlas

Componente **experimental e autoral de Carlos Felipe** para consultar código com
fonte, commit, hashes e limites explícitos. Não é fork nem distribuição do GitNexus.

**Primeiro marco implementado:** aquisição de snapshot público autorizado pela API
GitHub, parsing estático de Python e JavaScript/TypeScript, cinco operações locais e
um adaptador de consumo de evidências para o Security Workbench. Código em PRs,
sem merge automático. **Ainda não é um plugin conectado ao ChatGPT nem um MCP remoto.**

## O que responde

| Operação local | Resultado |
| --- | --- |
| `repo_summary` | Arquivos lidos, hashes, contagens e omissões. |
| `search_symbols` | Declarações cujo nome contém o termo literal; preserva homônimos. |
| `symbol_context` | Expressões de chamada lexicalmente contidas na declaração. |
| `impact_preview` | Referências sintáticas candidatas pelo nome terminal; não prova dependência. |
| `source_excerpt` | Trecho exato, linhas inclusivas 1-based e proveniência por commit. |

Todo resultado declara cobertura e limitações. Não executa scripts, imports,
configurações ou código do repositório analisado. Não aplica mudanças.

## Experimentar sem conta, token ou chamada paga

Requisitos: Node.js 22+ e Python 3.12+. O parser TypeScript está fixado em 5.8.3
com lockfile; Python usa a biblioteca padrão. Instale apenas as dependências do
**Atlas**, nunca as do repositório a analisar.

```sh
git clone --branch feat/snapshot-engine https://github.com/ofelipepeixoto/radar-code-atlas.git
cd radar-code-atlas
npm ci --ignore-scripts --no-fund
npm run check
npm test
npm run demo
```

A demo é **sintética**. Seu snapshot informa `origin: fixture-transport`.
O pacote é `private: true` para prevenir publicação npm acidental; o repositório é público.

## Consulta real por snapshot

A CLI é operada localmente por alguém autorizado. Ela confere correspondência de
nome/ID/commit, não autentica o proprietário nem concede permissão para ler dados.
O piloto recusa repositórios privados. Um `GITHUB_TOKEN` de leitura pode ser
configurado no ambiente para a cota da API; não é necessário no exemplo público.
Ele nunca é repassado aos processos de parsing. A conexão GitHub do ChatGPT não é
uma credencial automática da CLI.

```sh
umask 077
mkdir -p .snapshots
node src/cli.mjs acquire \
  ofelipepeixoto/security-workbench \
  1419403320 \
  cf906efd01c832632f96eafac6555d55f4e39ff9 \
  '["workbench/github.py","workbench/store.py"]' > .snapshots/workbench.json
```

Guarde o `digest` retornado em um registro confiável separado. Na consulta, use
esse valor conservado — não simplesmente um digest que acompanhou um arquivo de
origem desconhecida. Para a aquisição histórica acima, o valor registrado foi:
`622df05348b2aa1cd6437f3ed30959d58809834cdca5021e5393c30d584eae21`.

```sh
node src/cli.mjs query .snapshots/workbench.json \
  622df05348b2aa1cd6437f3ed30959d58809834cdca5021e5393c30d584eae21 \
  search_symbols '{"query":"_request_json"}'
```

O digest pode mudar ao alterar seleção, filtros ou contrato; isso exige uma nova
observação confiável, não substituir silenciosamente o valor esperado.
Use o `id` retornado para `symbol_context`/`impact_preview`.

## Evidência executada e consumidor

[Registro da primeira consulta real](docs/VALIDATION.md) separa testes com fixtures,
aquisição HTTPS real e limitações. O recorte observado leu dois arquivos Python do
Workbench e encontrou 16 declarações. A função `_request_json` foi localizada na
linha 28; o contexto apresentou 18 expressões de chamada, das quais 10 retornadas
com `truncated: true`.

`adapters/security_workbench.py` verifica as citações contra bytes obtidos pelo
consumidor e retorna apenas contexto auxiliar, não revisado. Não grava no banco,
não cria achado e não muda seu estado para confirmado. O adaptador foi executado
localmente; **não está integrado à CLI/interface hospedada do Security Workbench**.
Veja [o contrato do consumidor](docs/WORKBENCH.md).

## Limites e segurança

Aquisição: 20 arquivos, 128 KiB por arquivo, 1 MiB de fontes, 2.000 entradas e
80 requisições GET. Cada requisição tem teto de 8 segundos; não há retry automático.
Parsing: 15 segundos por processo, teto global de 60 segundos, limites de saída e
memória do worker. Esses controles não substituem sandbox de produção.

Arquivos não suportados, symlinks, submódulos, diretórios ocultos/dependências,
conteúdo rejeitado e fontes omitidas aparecem na cobertura. O filtro de segredos
é conservador e não certifica ausência de dados sensíveis. Não publique snapshots.

Análise limitada à sintaxe: sem resolução de tipos, aliases, dependências
transitivas, imports entre módulos ou comportamento em execução. `impact_preview`
pode trazer falsos candidatos por homônimos e perder chamadas dinâmicas.
`treeTraversalComplete` refere-se à travessia permitida pelos filtros; não significa
que todos os arquivos do repositório foram lidos. Resultado vazio não prova ausência.

`src/access-policy.mjs` é uma política preparatória com verificador de tokens
injetado. Os testes usam claims fictícios: **não há OAuth/JWKS real homologado e a
CLI não ativa essa política implicitamente**. Não exponha a CLI na rede.

## Arquitetura e próximos marcos

```text
GitHub HTTPS → ID/commit → árvores/blobs verificados → snapshot imutável
→ parsing em processos limitados → consultas locais → citações verificáveis
→ adaptador de contexto auxiliar para revisão humana
```

Depois da revisão das PRs: integrar o consumidor no Workbench e homologar um
transporte MCP autenticado com testes entre duas identidades e revogação.
Sem novos agentes, painel, GPU, embeddings, Supabase, n8n ou implantação VPS neste marco.

## Autoria e licenças

Código e fixtures originais sob [MIT](LICENSE). GitNexus foi referência técnica da
decisão, não código redistribuído, dependência ou alegação de autoria sobre terceiros.
Não há certificação jurídica de clean room. TypeScript conserva sua licença
Apache-2.0; Python é runtime externo. Veja [proveniência](docs/PROVENANCE.md).
