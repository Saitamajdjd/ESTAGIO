# Regras de negócio

## Escopo

A demonstração representa atendimento, seleção de imóveis, visita, negociação, reunião, documentos e encaminhamento ao setor de contratos. Assinatura, garantia locatícia, análise de crédito, cobrança, gestão de inadimplência e integração efetiva com CRM estão fora do escopo. Pessoas, endereços e valores dos cenários são fictícios.

## Etapas e condições de avanço

| Etapa | Entrada / ação permitida | Próximo estado |
| --- | --- | --- |
| Atendimento inicial | Nome, consultor e necessidades registrados. Selecionar ao menos um imóvel válido. | Envio de imóveis. |
| Envio de imóveis | Apresentar imóveis compatíveis; preparar links locais. Cliente escolhe imóvel já apresentado e sugere data/horário. | Aguardando confirmação do proprietário. |
| Aguardando confirmação do proprietário | Confirmar disponibilidade ou propor outra data. | Visita agendada quando houver confirmação; permanece aguardando após reagendamento. |
| Visita agendada | Registrar realização em data igual ou posterior à visita; ou reagendar, exigindo nova confirmação. | Visita realizada ou aguardando proprietário. |
| Visita realizada | Cliente rejeita o imóvel ou apresenta primeira proposta. | Envio de imóveis ou Negociação e documentação. |
| Negociação e documentação | Registrar contraproposta ou aceite da proposta corrente antes do vencimento. | Permanece negociando; com acordo, Reunião e documentação; se expirar, Envio de imóveis. |
| Reunião e documentação | Agendar reunião; na data ou depois dela, registrar ficha e anexos. | Encaminhado ao setor de contratos quando os requisitos estiverem completos. |
| Encaminhado ao setor de contratos | Consulta aos registros e arquivos. | Etapa final da demonstração. |

Não há botão genérico para mover livremente entre etapas. Cada ação valida as pré-condições no servidor, mesmo se enviada diretamente à API.

### Encerramento voluntário

É permitido encerrar um atendimento ainda não finalizado por **Desistência**, **Recusa da visita** ou **Falta de interesse**. A etapa passa para Atendimento encerrado. Um ciclo aberto é encerrado, preservando seus dados; ele não expira posteriormente. Caso já exista acordo, o fato histórico do acordo continua preservado, e o atendimento registra o encerramento posterior.

### Disponibilidade e novas buscas

Reagendar uma visita exige data atual/futura, horário válido e motivo. A visita volta a depender da confirmação do proprietário. O histórico mantém as tentativas de horário. Uma visita futura não pode ser marcada como realizada antes de sua data de referência. Nesta demonstração, a validação temporal da realização considera o dia, não a hora.

Após uma visita sem interesse, o atendimento retorna a Envio de imóveis e a seleção/visita atual é limpa. A lista de interesses já apresentados permanece para consulta. É possível acrescentar outro imóvel e repetir a jornada.

Os links do catálogo são locais, por exemplo `/#properties?imovel=house-2055`. O sistema registra sua preparação e apresentação. Não transmite mensagens ao cliente nem publica links acessíveis pela internet.

## Prazo de negociação

**RN-01 — Início:** a primeira proposta de um ciclo registra `firstProposalDate` e fixa `deadline = firstProposalDate + 14 dias corridos`. É necessário ter uma visita realizada para o imóvel desse ciclo.

**RN-02 — Unidade temporal:** a contagem é por datas civis. Inclui finais de semana e feriados, sem ajuste comercial. Exemplo: primeira proposta em 20/10/2026; limite em 03/11/2026.

**RN-03 — Último dia de acordo:** acordos e contrapropostas são aceitos somente quando a referência é estritamente anterior ao prazo. Em 03/11/2026, o prazo já está atingido, mesmo que o robô ainda não tenha sido executado.

**RN-04 — Aviso antecipado:** quando faltar **exatamente um dia**, o ciclo estiver aberto e não houver acordo, criar um aviso interno pendente de leitura para o consultor. Registrar a geração no histórico. Cada ciclo recebe no máximo um aviso desse tipo.

**RN-05 — Sem retroatividade:** se a primeira verificação ocorrer no dia limite ou depois, expirar diretamente. Não criar um aviso fictício de um dia anterior.

**RN-06 — Expiração:** quando a referência alcançar ou ultrapassar o limite sem acordo válido:

1. Alterar o status para Prazo expirado.
2. Registrar a data efetiva de encerramento e o motivo, mantendo o prazo original.
3. Encerrar a proposta corrente como expirada, sem remover seus dados.
4. Gerar mensagem pendente ao proprietário, vinculada ao imóvel e ciclo.
5. Retornar o atendimento para Envio de imóveis e limpar a visita/seleção corrente.
6. Registrar ações executadas e estados antes/depois no histórico.

Se o motor for executado com atraso, a data de encerramento corresponde à execução e a data limite permanece a originalmente calculada. Isso diferencia o vencimento da data em que o sistema tratou o vencimento.

## Propostas, contrapropostas e aceites

**RN-07 — Identificação:** toda proposta tem ID, valor em centavos, autor (`client` ou `owner`), data, status e lista de aceites. Status possíveis: aguardando aceite, substituída, aceita, expirada e cancelada.

**RN-08 — Aceite do autor:** o autor concorda implicitamente com o valor que apresentou. Esse aceite é registrado com data e ID da proposta. A outra parte precisa confirmar explicitamente.

**RN-09 — Mesmo valor e mesma proposta:** acordo exige aceites de cliente e proprietário associados ao ID da proposta corrente e registrados antes do limite. Aceites de outras propostas, atendimentos, imóveis ou ciclos são recusados.

**RN-10 — Contraproposta:** uma nova proposta torna a anterior substituída. Os aceites anteriores permanecem visíveis no histórico, mas não são copiados. Só o autor da nova proposta começa com aceite. Mesmo se o mesmo valor for reapresentado como uma nova proposta, ela tem identidade independente e exige confirmação da outra parte.

**RN-11 — Prazo fixo:** contrapropostas não alteram primeira proposta, prazo máximo ou número do ciclo. O histórico registra o valor anterior e o novo.

**RN-12 — Acordo concluído:** com ambas as partes de acordo, o ciclo é encerrado como Acordo registrado, sua contagem termina e o atendimento avança para Reunião e documentação. Não é possível continuar contrapropostas nesse ciclo ou expirá-lo depois. Uma eventual renegociação posterior a um acordo firmado está fora do escopo.

**RN-13 — Interpretação do cenário 5:** a proposta anterior de Lucas tinha aceite do cliente, seu autor, e aguardava o proprietário. O proprietário apresentou uma contraproposta de R$ 1.750,00. O aceite de R$ 1.650,00 continua histórico e não vale para a proposta atual. Não se simula contraproposta após um acordo já concluído por ambas as partes.

## Novos ciclos e limites de isolamento

**RN-14 — Recomeço:** após voltar à busca, é possível apresentar outro imóvel, realizar nova visita e iniciar um ciclo. Ele ganha ID, primeira proposta, prazo e aceites novos. O ciclo encerrado não é reaberto nem editado.

**RN-15 — Um ciclo aberto por atendimento:** iniciar um segundo ciclo simultâneo no mesmo atendimento é bloqueado. Para interesses paralelos do mesmo cliente, podem existir atendimentos separados. Os códigos/IDs distinguem os dados, mesmo que o nome do cliente ou imóvel seja igual.

**RN-16 — Histórico:** eventos nunca são removidos por aceites, contrapropostas, expiração ou novas buscas. A restauração intencional substitui o conjunto inteiro da demonstração, após backup. Visitas de um novo imóvel não são associadas ao ciclo anterior encerrado.

## Reunião e documentos

**RN-17 — Ficha cadastral:** exige acordo e reunião agendada. Só pode ser registrada no dia da reunião ou depois. Exige nome, contato e dados/observações; não inclui validação real de CPF ou análise cadastral. Depois de registrar a ficha, o agendamento não é alterado.

**RN-18 — Anexos reais:** PDF, PNG, JPEG ou TXT, não vazios, até 2 MB cada, até 10 por ciclo. O backend valida tamanho, extensão e estrutura base64; não valida autenticidade documental nem faz análise antivírus. O conteúdo é armazenado e pode ser baixado novamente.

**RN-19 — Encaminhamento:** exige acordo válido, ficha do ciclo corrente e ao menos um arquivo do mesmo atendimento/ciclo. A mudança de etapa registra encaminhamento local, com data e histórico. Nenhuma transmissão a um setor ou sistema externo é alegada.

## Notificações, execução e indicadores

**RN-20 — Mensagens honestas:** aviso interno pode ser marcado como lido. Mensagem ao proprietário permanece pendente de envio, pois não existe provedor de e-mail/WhatsApp conectado. Não há botão que invente um envio bem-sucedido.

**RN-21 — Idempotência:** a unicidade dos efeitos depende de ID de ciclo + tipo do evento/notificação, além do status do ciclo. Reexecutar a mesma data registra outra avaliação em `runs`, mas não gera novos avisos nem encerra novamente um ciclo.

**RN-22 — Referência compartilhada:** o simulador pode repetir ou avançar a data. Retrocessos são recusados. Toda ação interativa é datada pela referência corrente, que aparece no painel. O timestamp real de auditoria é separado.

**RN-23 — Execução explícita:** somente o botão de verificação ou a CLI avalia os prazos. Carregar a página e consultar dados não expira ciclos. Um ciclo aberto cujo limite já chegou exibe Verificação necessária; aceitar ou contrapropor nessa situação é bloqueado.

**RN-24 — Indicadores:** andamento conta ciclos abertos; próximas conta abertos com exatamente 1 dia; expiradas e com acordo incluem ciclos históricos; notificações pendentes inclui avisos não lidos e mensagens não enviadas. O aviso é um subconjunto do andamento. A lista mostra o ciclo mais recente de cada atendimento; a aba Propostas e ciclos exibe todos.

**RN-25 — Conflitos:** aceites antigos são bloqueados pelo ID da proposta; formulários desatualizados também são bloqueados pela revisão global. Falhas não persistem mutações parciais. Operações do terminal e da API respeitam o mesmo bloqueio de arquivo.
