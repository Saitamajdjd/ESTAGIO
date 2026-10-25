# Resultados reais dos testes

Validação realizada em **25/10/2026**, no Windows (`win32`), com **Node.js v24.15.0**, **npm 11.12.1** e **Microsoft Edge headless**, controlado via CDP. As datas de novembro são referências simuladas; os timestamps reais da validação estão nos arquivos de evidências.

## Análise do projeto recebido

A arquitetura existente foi preservada: `src/domain.js` contém as ações e validações; `src/automation.js` avalia os prazos; `src/storage.js` persiste JSON sob bloqueio; `src/server.js` oferece a API local; `public/app.js` chama essa API. CLI e interface usam o mesmo motor e o mesmo arquivo de dados.

Antes das alterações, os **33 testes existentes passaram**. A validação existente no navegador e a checagem de sintaxe também passaram. Não houve falha prévia das regras a corrigir. Já funcionavam de verdade:

- Prazo de 14 dias a partir da primeira proposta, aviso de um dia e expiração sem acordo.
- Mudança automática para Envio de imóveis e geração de mensagem pendente ao proprietário na expiração.
- Aceite da mesma proposta por ambas as partes, encerramento da contagem e avanço para documentação.
- Contrapropostas sem herdar aceites antigos nem reiniciar o prazo; novos ciclos isolados por imóvel.
- Jornada de visitas, ficha, upload/download de documentos e encaminhamento local, acionados pelo usuário e validados no servidor.
- Histórico, persistência, concorrência entre CLI/API, restauração por CLI com backup e idempotência dos efeitos da simulação.

Foram acrescentados restauração pela interface com controle de revisão, comparação separada de João/Ana com o mesmo prazo, logs mais completos, atalhos Windows, quatro testes de regressão e verificações adicionais no navegador.

## Execuções concluídas

| Verificação | Resultado observado |
| --- | --- |
| `npm.cmd test` no código recebido | 33 testes, 33 aprovados, 0 falhas, 0 ignorados. |
| `npm.cmd run test:browser` no código recebido | Fluxos existentes concluídos no Edge; lista de erros vazia. |
| `npm.cmd test` após as alterações | **37 testes, 37 aprovados, 0 falhas, 0 cancelados, 0 ignorados**. 24 testes de domínio/automação e 13 de integração. |
| `npm.cmd run check` | Saída 0: sintaxe de `public/app.js` e `src/server.js` válida. |
| `npm.cmd run test:browser` ampliado | Saída 0; 13 registros de verificação concluídos; nenhum erro JavaScript/de página coletado. |
| `restaurar-demo.cmd` | Saída 0, cinco cenários e referência 25/10/2026 recuperados, backup criado. |
| `iniciar-demo.cmd` | Servidor real respondeu HTTP 200 e retornou os cinco cenários. Foi usada uma porta temporária via `PORT` para isolar a validação. |
| CLI em 02/11, repetição, 03/11 e repetição | Quatro execuções concluídas com saída 0; HTTP leu as mesmas alterações no arquivo real. |
| `restaurar-demo.cmd` com servidor aberto | Saída 0; API e arquivo confirmaram cinco cenários e 25/10/2026 após a restauração. |
| Exclusões do Git | `git check-ignore` confirmou estado JSON, backups, `.qa`, `.env`, `.env.local`, `node_modules` e `.aws/credentials` fora da publicação. |

A última saída de `node:test` registrou duração de **1522,831 ms**; isso é o tempo observado dessa execução, não um benchmark. A validação ampliada do navegador foi registrada em **2026-10-25T23:17:23.697Z**. A verificação final dos atalhos Windows foi registrada em **2026-10-25T23:22:01.578Z**.

Evidências: [saída integral dos 37 testes](evidencias/testes.txt), [relatório do navegador](evidencias/navegador.json), [execuções reais da demonstração](evidencias/demonstracao.json) e [atalhos Windows/CLI](evidencias/windows.json).

## Comportamento comprovado pela interface e pelo armazenamento

O teste de navegador clicou nos botões reais, aguardou os resultados e leu o JSON por `JsonStore`. Antes do roteiro principal, a restauração foi acionada na própria interface. O backup foi comparado integralmente com o estado anterior, incluindo os documentos anexados no fluxo de teste.

| Cenário | Evidência observada |
| --- | --- |
| João, primeira proposta em 20/10/2026 | Prazo persistido: 03/11/2026. |
| Simular 02/11/2026 | Um dia restante; aviso ao consultor persistido; ciclo aberto. |
| Repetir 02/11/2026 | Arrays de eventos e notificações idênticos ao estado anterior; zero novos efeitos. |
| Simular 03/11/2026 | João expirado, `endedOn = 2026-11-03`, etapa `search`/Envio de imóveis, imóvel/visita liberados e uma mensagem ao proprietário com `status = pending`. |
| Ana, acordo anterior ao mesmo prazo | Cliente aceitou a proposta atual em 20/10 como autor; proprietário confirmou em 22/10. Ciclo inteiro permaneceu idêntico após a expiração de João. Nenhuma notificação de expiração para Ana. |
| Repetir 03/11/2026 | Eventos, notificações, ciclos e atendimentos idênticos; apenas um novo registro em `runs`. |
| Recarregar a página | Estado expirado de João e último log continuaram visíveis. O teste de integração também reabriu outra instância HTTP sobre o arquivo persistido. |
| Logs | Condições, `simulatedAt`, `recordedAt`, resultado por ciclo, estados anterior/posterior, campos alterados, IDs de eventos/notificações e totais persistidos. |

Contagens extraídas das quatro execuções do roteiro limpo, que avalia **todos os cinco ciclos**:

| Referência | Execução | Ações | Eventos novos | Notificações novas |
| --- | --- | ---: | ---: | ---: |
| 02/11/2026 | Primeira | 5 | 6 | 3 |
| 02/11/2026 | Repetição | 0 | 0 | 0 |
| 03/11/2026 | Primeira | 6 | 8 | 2 |
| 03/11/2026 | Repetição | 0 | 0 | 0 |

Mariana também expira em 02/11; Lucas recebe aviso em 02/11 e expira em 03/11. Pedro já está expirado nos dados iniciais. Ana não sofre alterações. Os totais acima não se referem somente a João.

Capturas: [aviso](evidencias/aviso.png), [encerramento e comparação dos casos](evidencias/simulador.png), [aceites de Ana](evidencias/acordo.png) e [notificações de João](evidencias/notificacao.png).

## Cobertura adicional e limites

A suíte também validou contrapropostas, recusa de aceites fora do prazo ou de outra proposta, imutabilidade de ciclos anteriores, virada de mês/ano e ano bissexto, três fusos, visitas/reagendamento, encerramento voluntário, validação de valores/campos, requisitos para documentação, upload/download real, concorrência, rollback sem gravação parcial, revisão antiga (HTTP 409), corrupção de JSON e backup.

O navegador exercitou criação de atendimento até a primeira proposta, aceite de contraproposta, reunião, ficha, anexo, encaminhamento, navegação e catálogo. O painel não apresentou transbordamento horizontal em 375, 768, 1024 e 1440 px; o simulador atualizado também foi conferido em 375 e 1440 px. São tamanhos emulados, não testes em aparelhos físicos.

Na validação operacional auxiliar dos atalhos, a primeira tentativa de encerrar a árvore do processo de teste não finalizou no ambiente restrito. O auxiliar foi ajustado, os processos de teste foram encerrados e a verificação completa foi repetida com **saída 0**. Nenhum teste funcional do sistema falhou. A verificação Git exigiu uma exceção `safe.directory` restrita ao comando e à pasta do projeto devido ao usuário do sandbox; nenhuma configuração Git global foi alterada.

Não foram validados envio real de mensagens, integração Bitrix24, hospedagem, execução contínua, assinatura ou cobrança, pois esses recursos não estão implementados. A regra roda quando o usuário clica em Executar verificação ou chama a CLI. A consulta periódica do painel apenas lê o estado.

## Reproduzir

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run test:browser
```

O teste de navegador requer Microsoft Edge no Windows; `EDGE_PATH` permite informar outro caminho. Usa dados isolados em `.qa` e cria seu próprio servidor. Os testes unitários/de integração usam diretórios temporários. Nenhuma dessas suítes usa dados de produção.

Para repetir a apresentação e os comandos Windows, siga [DEMONSTRACAO.md](DEMONSTRACAO.md). Ao fim desta preparação, `data/store.json` ficou restaurado em **25/10/2026**, com cinco cenários; os servidores auxiliares usados na validação foram encerrados.
