# Segurança
Não expor a CLI como HTTP. Assinatura/JWKS, OAuth real, revogação e isolamento remoto exigem homologação própria. Sem escrita de código.
Somente fontes públicas autorizadas no piloto. Filtros de nomes/padrões não certificam ausência de segredos. Não publicar snapshots completos. Reportar falhas ao proprietário por canal privado.
Sem multi-tenancy, benchmark de escala, custódia ou assinatura de relatórios. Processos limitados não equivalem a sandbox de produção hostil.

## Controles efetivamente testados nesta camada
Host/API fixos, sem redirects/retries; limites de bytes; comparação de repository ID
e commit; hashes de árvores/blobs; negação de symlink/submódulo e caminhos sensíveis;
verificação do snapshot e trecho; recusa de ferramentas de escrita. Claims OAuth
nos testes são fictícios, não autenticação criptográfica.
Filtro de segredos é incompleto por definição. Use apenas fontes públicas autorizadas,
revise os relatórios antes de compartilhar e retenha âncoras de integridade separadamente.
Sem sockets HTTP abertos, download de imagens, montagem Docker, credenciais de produção
ou execução do código-alvo. Limites de processo não substituem isolamento de sistema.
