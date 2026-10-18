# Contrato v1 — leitura de snapshot
Escopo confiável: `repository` (owner/name), `repositoryId` inteiro positivo e `commit` SHA-1 completo. Nome/id são conferidos na API, o commit deve coincidir. Isso verifica correspondência técnica, não autentica a identidade humana do operador.
Aquisição das árvores Git e blobs regulares, sem checkout, symlinks, submódulos, hooks ou execução. Limites: 20 arquivos, 128 KiB por arquivo, 1 MiB de fontes, 2000 entradas e 80 requisições. Registrar omissões, truncamentos e erros de parser.
Resposta: versão, ferramenta, escopo, `snapshotDigest`, cobertura e limitações. Evidência: linhas 1-based inclusivas, texto exato, SHA-256 do arquivo/trecho, blob Git e URL por commit. Fonte é dado não confiável, não instrução.
Digest incluído no próprio arquivo não autentica origem. Reabertura exige digest conservado independentemente e reverificação dos hashes. A política OAuth preparatória não fica implicitamente ativa na CLI local.
`impact_preview` apresenta referências sintáticas candidatas, não resolução de tipos, dependência comprovada, grafo completo ou garantia de quebra. Não faz inferência transitiva.
Security Workbench: contexto apenas auxilia revisão, nunca cria achado confirmado nem amplia autorização. Conferir escopo, digest e trecho contra bytes confiáveis do consumidor. Sem integração automática à interface hospedada.

## Limites efetivos da primeira implementação
Seleção opcional `includePaths` deve ser explícita e passar pela mesma política de
caminhos. Caminhos pedidos e não encontrados são relatados. Travessia completa é
relativa aos filtros do piloto, não aos diretórios excluídos.
TypeScript usa AST via Compiler API 5.8.3; Python usa `ast.parse`. São parsers
sintáticos sem carregamento de dependências/configurações do alvo.
Tokens da API não entram no ambiente dos workers. Timeout de 15s por parser e 60s
para o conjunto; excesso/erro é cobertura parcial e não um índice vazio certificado.
Não há indexação persistente em banco nesta fatia; o snapshot JSON local é reverificado
a cada processo de consulta. Política de acesso injetável é separada da CLI local.
