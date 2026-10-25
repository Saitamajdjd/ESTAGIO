# Arquitetura da demonstração

## Visão geral

Aplicação monolítica local com separação entre apresentação, transporte HTTP, domínio, automação e persistência. O frontend utiliza HTML/CSS/JavaScript sem build. O backend usa `node:http`, `node:fs/promises`, `node:crypto` e módulos ES. Nenhum pacote de produção ou serviço remoto é necessário.

A interface envia comandos para a API. A API abre uma transação do `JsonStore`, executa as funções de domínio ou o motor e persiste o resultado. A CLI chama essas mesmas funções, sobre o mesmo arquivo. A interface nunca calcula sozinha se um acordo é válido ou se uma transição é permitida.

## Componentes e responsabilidades

| Módulo | Responsabilidade |
| --- | --- |
| `dates.js` | Validar datas civis, somar 14 dias e comparar dias inteiros. |
| `domain.js` | Validar etapas, propostas e aceites; criar eventos e notificações; encerrar/iniciar ciclos; ficha e documentos. |
| `automation.js` | Avaliar cada ciclo, produzir condições booleanas, executar ações elegíveis e salvar relatório antes/depois. |
| `storage.js` | Serializar gravações entre processos, executar transações, trocar JSON atomicamente e salvar backups. |
| `seed.js` | Montar os cinco cenários usando as próprias operações de domínio. |
| `view.js` | Calcular indicadores e expor dados sem os conteúdos base64 dos anexos. |
| `server.js` | Servir arquivos permitidos e rotas HTTP; tratar erros e limitar payload. |
| `cli.js` | Executar verificação com data informada/atual e restaurar demonstração. |
| `public/app.js` | Renderizar painel, formulários, filtros, histórico, notificações e relatórios. |

## Modelo de dados

`schemaVersion` identifica a versão do formato. `revision` é incrementada após mutações, possibilitando detectar formulários desatualizados. `referenceDate` é a data civil compartilhada por todas as ações.

| Coleção | Principais campos e relação |
| --- | --- |
| `properties` | Identidade do imóvel, localização fictícia, aluguel de referência e proprietário. |
| `deals` | Código, cliente, necessidades, consultor, etapa, interesses, visita, reunião, ficha e ID do ciclo mais recente. |
| `cycles` | ID independente, atendimento, imóvel, número sequencial por atendimento, primeira proposta, prazo, status e propostas. |
| `proposals` (dentro do ciclo) | ID, valor em centavos, autor, data, status e aceites vinculados a esse ID. |
| `events` | Atendimento/ciclo, tipo, mensagem, detalhes, data de referência e timestamp real de registro. |
| `notifications` | Chave única por ciclo/tipo, destinatário, mensagem, status e datas. |
| `documents` | Atendimento/ciclo, nome, tamanho, data e bytes codificados em base64. |
| `runs` | Origem da execução, data anterior/atual, condições por ciclo, ações e snapshots. |

Um atendimento tem um ciclo ativo por vez, mas conserva vários ciclos históricos. O mesmo cliente pode ter outros atendimentos para interesses simultâneos; esta demonstração não faz unificação por CPF ou cadastro mestre. O ID do atendimento, e não o nome do cliente, define seus limites.

O imóvel guarda seu aluguel de referência. O valor negociado e os aceites ficam em cada proposta. Negociar um imóvel não altera a referência de preço nem a negociação de outro cliente. A ficha e os documentos carregam `cycleId` para não satisfazerem os requisitos de um ciclo diferente.

## Datas e dinheiro

Datas de negócio são strings ISO `AAAA-MM-DD`. A validação verifica o formato e a existência no calendário. Para somar e subtrair, o sistema converte as datas civis para meia-noite UTC; assim, mudança de fuso ou horário de verão não transforma um dia em 23/25 horas.

A interface exibe `DD/MM/AAAA` sem converter a data civil para horário local. `recordedAt` usa um instante UTC real e é apresentado no fuso do navegador. A CLI sem data lê o calendário local do computador, converte para ISO civil e utiliza a mesma aritmética.

Valores persistidos em centavos inteiros evitam comparação de valores monetários em ponto flutuante. A entrada admite até duas casas decimais, valor mínimo de R$ 1,00 e máximo de R$ 100.000.000,00. A apresentação utiliza `Intl.NumberFormat('pt-BR')`.

## Avaliação da regra de 14 dias

Para cada ciclo o motor registra oito condições: ciclo iniciado, ciclo aberto, acordo válido, aceite do cliente na proposta atual dentro do prazo, aceite do proprietário na proposta atual dentro do prazo, exatamente um dia restante, prazo atingido e aviso já existente. A regra de aviso exige ciclo aberto, sem acordo, um dia restante e ausência do aviso. A expiração exige ciclo aberto, sem acordo e data maior ou igual ao prazo.

O log persiste `simulatedAt` (meia-noite UTC da data civil), `recordedAt` (instante real), `outcome` (resultado por ciclo), snapshots anterior/posterior, `changes` (campos alterados), IDs dos eventos e notificações criados e seus totais. A referência de meia-noite explicita a precisão diária da regra; não corresponde ao horário real da execução nem representa um temporizador em funcionamento.

Na expiração, uma única transação encerra o ciclo, gera o rascunho ao proprietário, registra a mudança de etapa para busca e preserva propostas, aceites e motivo. Um acordo válido tem prioridade e impede expiração. Ciclos encerrados continuam aparecendo no relatório, mas não sofrem novas ações.

Cada execução cria um registro em `runs`, mesmo que produza zero ações. Eventos de negócio usam chaves como `<cycleId>:expired`, `<cycleId>:deadline-warning` e `<cycleId>:expiration-actions`. Notificações usam a combinação ciclo/tipo. Repetir a execução audita a consulta sem duplicar seus efeitos.

A verificação individual usa a referência corrente. Somente a verificação geral pode avançar a data, evitando envelhecer negociações sem avaliá-las no mesmo avanço. Não há retrocesso nem desfazer simulação; restaure os dados para repetir uma linha do tempo anterior.

## Concorrência e durabilidade

1. Adquire `store.json.lock` com abertura exclusiva `wx`. Outros processos aguardam, com timeout de 6 segundos.
2. Lê e valida o estado após adquirir o bloqueio.
3. Confere a revisão enviada pelo formulário, quando presente.
4. Executa a mutação em memória. Uma exceção impede o salvamento.
5. Grava um arquivo temporário na mesma pasta, sincroniza e renomeia sobre o arquivo principal.
6. Libera o bloqueio em `finally`.

Leituras também respeitam o bloqueio. Servidor e CLI não mantêm cópias divergentes em memória entre requisições. Gravação atômica reduz risco de JSON parcial; não equivale a um banco com recuperação transacional completa, replicação ou garantia contra falha física de disco. Interrupção abrupta pode deixar lock/temporário; a recuperação manual está no README.

A restauração guarda uma cópia anterior antes de trocar os dados. Usa nova revisão e novas identidades, impedindo que formulários antigos acertem os cenários restaurados. Em falha ao fazer backup, a restauração não prossegue.

## API local

| Método e rota | Uso |
| --- | --- |
| `GET /api/health` | Disponibilidade do processo HTTP. |
| `GET /api/state` | Estado público, indicadores, etapas e status. |
| `POST /api/deals` | Criar atendimento com nome, consultor e necessidades. |
| `POST /api/deals/:id/actions` | Executar ação de domínio com `action` e `payload`. |
| `POST /api/simulate` | Verificar a `date`, com `dealId` opcional para verificação individual. |
| `POST /api/demo/reset` | Restaurar cenários com backup; exige `revision` atual, verificada sob o mesmo bloqueio da gravação. |
| `POST /api/notifications/:id/read` | Registrar leitura de aviso interno; mensagens ao proprietário não podem ser marcadas como enviadas. |
| `GET /api/documents/:id` | Baixar bytes do anexo como attachment. |

POST usa `application/json` e pode receber `revision`. A interface sempre envia a revisão. Ações: `send-properties`, `request-visit`, `reschedule-visit`, `confirm-visit`, `complete-visit`, `reject-property`, `start-cycle`, `counterproposal`, `accept`, `schedule-meeting`, `registration`, `attach-document`, `forward-contracts`, `close`.

Aceite/contraproposta exige o ID da proposta corrente; não basta identificar o imóvel. Respostas usam 422 para regra inválida, 409 para conflito, 404 para recurso ausente, 403 para origem/host inválido, 415 para tipo indevido e 413 para payload acima de 3 MB. Erros inesperados são registrados no terminal, com mensagem genérica na interface.

## Preparação para execução periódica no Windows

**Nenhuma tarefa foi instalada.** A CLI já retorna código 0 em sucesso e 1 em falha e pode ser chamada futuramente pelo Agendador de Tarefas.

Configuração proposta, adaptando o caminho do Node:

```text
Programa: C:\Program Files\nodejs\node.exe
Argumentos: "C:\Users\valeu\Downloads\projetos\estagio desafio\src\cli.js" verify
Iniciar em: C:\Users\valeu\Downloads\projetos\estagio desafio
```

Escolha uma execução diária e revise a referência antes de habilitá-la. Caso o simulador tenha avançado além da data real, a CLI recusará retrocesso. O computador precisa estar ligado e a tarefa precisa ter permissão de escrita no arquivo. Se perder o dia 13, a próxima execução poderá expirar diretamente; não será criado um aviso retroativo.

## Integração futura com Bitrix24

Um adaptador separado poderia mapear os IDs de atendimentos, imóveis e ciclos aos registros do CRM e transportar eventos por API REST. Essa integração dependeria de recursos disponíveis no plano, permissões, autenticação, limites de uso e definição da fonte oficial de cada campo. Também exigiria idempotência na comunicação, repetição controlada em falhas e armazenamento seguro de credenciais.

Nada disso está configurado nesta entrega. O motor pode ser reutilizado, mas não há webhook, token, chamada de API Bitrix24 ou sincronização em execução.
