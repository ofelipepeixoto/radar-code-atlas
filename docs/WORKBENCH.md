# Contrato de consumo no Security Workbench

O módulo `adapters/security_workbench.py` é uma fronteira local testável, ainda
não instalada no repositório Workbench. Não substitui aquisição, revisão ou relatório
existentes. A UI e os bancos do Workbench permaneceram inalterados.

```python
context = consume_context(
    report,
    expected_scope,       # do escopo autorizado no Workbench, não do report
    expected_digest,      # registro independente da aquisição aprovada
    read_source,          # callback restrito aos bytes adquiridos nesse escopo
)
```

O callback não deve abrir livremente qualquer caminho do sistema de arquivos.
Prefira um mapa dos arquivos da aquisição confiável. A saída é sempre
`kind: auxiliary-code-context`, `reviewState: unreviewed` e `findingCreated: false`.

Verificações: escopo e digest, ferramenta permitida, caminhos, linhas inclusivas,
SHA-256 do arquivo/trecho, identidade Git do blob e correspondência literal do texto.
URLs são reconstruídas, não confiadas ao payload. Até 30 itens e trechos de 60 linhas.
Isso verifica integridade de citações contra os bytes fornecidos, **não comprova
veracidade de relações, completude semântica, ausência de vulnerabilidade ou autoria**.

Teste real desta etapa: report `symbol_context` sobre `_request_json` consumido
localmente com 11 citações verificadas (declaração + 10 chamadas), sem criar achado.
Testes negativos: escopo, digest, texto, linha, caminho, hashes e URL adulterados.

Próxima PR no Workbench deve ligar o adaptador ao escopo/bytes do próprio consumidor,
mostrar o contexto como auxiliar e repetir testes do Workbench. Não aumentar o limite
de aquisição nem aprovar achados automaticamente. A integração hospedada exige gate
separado e não faz parte desta entrega.
