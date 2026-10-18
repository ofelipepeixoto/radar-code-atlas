# Evidências do primeiro marco — 18/10/2026

## O que foi executado

1. Política preparatória: 39 testes com verifier/claims fictícios. Não é OAuth real.
2. Motor e controles: `npm run check`, `npm test` e `npm run demo` em sandbox Linux,
   Node 20.20.2 / Python 3.13.13. A matriz declarada do projeto é Node 22+; a execução
   no Node 20 é complementar, não substitui a CI Node 22.
3. **126 testes passaram**, zero skipped e zero failed na rodada registrada. Inclui
   os 39 testes de política; não somar as duas contagens como suítes independentes.
4. `npm audit --omit=dev --json`: zero advisories conhecidos retornados para a única
   dependência naquela consulta. Não é auditoria integral de segurança.
5. Aquisição HTTPS real via `src/github.mjs`, sem transporte fictício, de um commit
   específico do repositório público autorizado Security Workbench.
6. Consulta `symbol_context` e consumo local por `adapters/security_workbench.py`.

## Consulta real

Repositório: `ofelipepeixoto/security-workbench`, ID `1419403320`.
Commit: `cf906efd01c832632f96eafac6555d55f4e39ff9`.
Arquivos: `workbench/github.py` e `workbench/store.py`.
Foram observadas 95 entradas e feitas 21 requisições; 15.169 bytes de fontes lidos.
Dois arquivos parseados, 16 declarações, 187 expressões de chamada.
Isso não é cobertura completa: arquivos não selecionados/excluídos constam no report.

`_request_json` foi localizada em `workbench/github.py`, linha 28. Seu contexto
identificou 18 expressões lexicalmente contidas, retornando 10 com `truncated: true`.
O consumidor verificou 11 citações (declaração e 10 chamadas) contra bytes da aquisição.

`impact_preview` para o mesmo símbolo retornou zero candidatos neste recorte.
**Não inferir que a função não tem consumidores.** Esse algoritmo inicial só compara
nomes terminais de chamadas; referências como callbacks e aliases não são resolvidas.

Saídas geradas:
- `evidence/live-summary.json`: ambiente, escopo, hashes e cobertura.
- `evidence/workbench-context.json`: contexto real com citações.
- `evidence/workbench-impact.json`: resultado vazio com limitações.
- `evidence/consumer-summary.json`: prova de consumo sem criação de achados.
- `evidence/tests-summary.json`: contagens/comandos e integridade do código testado.

O snapshot completo permaneceu fora do Git. As citações são de fontes públicas do
próprio usuário, não material privado. Digest registrado:
`622df05348b2aa1cd6437f3ed30959d58809834cdca5021e5393c30d584eae21`.

## Falhas encontradas durante a construção

A primeira CI da camada de contratos falhou porque `examples/` estava vazio e não
foi incluído no checkout Git. O verificador passou a aceitar a ausência desse diretório
opcional; as pastas obrigatórias continuam exigidas. A CI corrigida foi conferida.

O primeiro limite de 5 segundos do worker TypeScript causou quatro falhas na suíte
sob cold start. Foi alterado para até 15 segundos por worker, execução dos testes em
série e orçamento total de parsing de 60 segundos. **Nenhum expected foi alterado
para igualar uma saída errada.**

## O que permanece não verificado

MCP remoto, OAuth/JWKS reais, múltiplas identidades, carga, Windows, fontes privadas,
resolução semântica completa, sandbox hostil, UI e banco do Security Workbench.
Nenhuma implantação, workflow n8n, migração Supabase, envio WhatsApp ou chamada LLM.
PRs e revisão humana permanecem separados da aprovação de testes.
