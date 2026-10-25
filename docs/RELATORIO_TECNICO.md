# Relatório técnico
## LocaFlux — Simulador de automação imobiliária

**Projeto:** demonstração complementar para o case NIA  
**Versão:** 1.0.0  
**Data da validação:** 25 de outubro de 2026  
**Tecnologias:** Node.js, JavaScript ES Modules, HTML5, CSS3, JSON e `node:test`  
**Ambiente validado:** Windows, Node.js 24.15.0, npm 11.12.1 e Microsoft Edge

---

## 1. Contexto do desafio

O desafio do processo seletivo de estágio em desenvolvimento Bitrix24 na NIA envolve representar e organizar a locação de uma imobiliária com 40 anos de existência. As entregas oficiais previstas incluem um fluxograma, um Kanban no Trello e, como diferencial, um Kanban no Bitrix24.

Conforme o contexto informado pelo participante, o Kanban no Bitrix24 já havia sido desenvolvido e algumas automações haviam sido testadas. O plano utilizado limitou a continuidade da configuração de novas regras. Essa limitação motivou uma demonstração externa capaz de evidenciar a lógica de negócio, a modelagem de processos e a execução verificável de automações.

O LocaFlux foi construído para complementar esse trabalho. Não substitui o CRM nem afirma reproduzir todas as funcionalidades do Bitrix24. Esta entrega não inclui a criação do Trello ou do fluxograma obrigatório.

## 2. Objetivo da solução

Demonstrar, com um sistema funcional, o acompanhamento de negociações e a regra de prazo máximo de 14 dias. O objetivo técnico é transformar condições comerciais em operações executáveis, persistentes, auditáveis e testáveis.

A solução permite identificar necessidades, apresentar imóveis, organizar visitas, registrar propostas e contrapropostas, confirmar aceites, agendar reunião, armazenar ficha e documentos e encaminhar o atendimento ao setor de contratos no ambiente local.

O diferencial central é o Simulador de Execução, que permite avaliar datas escolhidas e observar quais condições foram verdadeiras ou falsas, quais ações ocorreram e como os estados se alteraram. Assim, a apresentação pode demonstrar consequências concretas sem depender da passagem de duas semanas no calendário real.

## 3. Arquitetura da demonstração complementar

A aplicação utiliza um servidor HTTP nativo do Node.js e uma interface em HTML, CSS e JavaScript, sem framework pesado. O motor de automação e as regras de domínio ficam separados da interface. Esse isolamento permite executar as mesmas regras por botões no navegador ou por comando de terminal.

Os dados são armazenados em um único arquivo JSON. Servidor e CLI acessam o mesmo caminho por padrão. Uma camada de persistência coordena as gravações com bloqueio exclusivo de arquivo, validação de revisão e substituição atômica do estado. Isso reduz o risco de perda de alterações quando a apresentação alterna entre navegador e terminal.

O modelo distingue imóveis, atendimentos, ciclos e propostas. Um mesmo atendimento pode preservar ciclos anteriores, cada um ligado a um imóvel e a um prazo próprio. Aceites pertencem a propostas específicas. A separação impede que a alteração de um valor reaproveite concordâncias anteriores ou que um novo imóvel herde o prazo de uma negociação encerrada.

Cada evento registra uma data de negócio e um timestamp real de auditoria. Essa distinção torna transparente o uso de datas simuladas. Documentos fictícios podem ser anexados, persistidos em base64 e baixados novamente; o encaminhamento ao setor de contratos é registrado como uma mudança local de etapa.

## 4. Funcionamento da regra de 14 dias

Ao registrar a primeira proposta, o sistema fixa a data inicial do ciclo e calcula o prazo somando 14 dias corridos. Uma proposta de 20/10/2026 tem prazo em 03/11/2026. A contagem usa datas civis, com aritmética UTC, evitando distorções por fuso ou horário de verão.

Em 02/11/2026, se o ciclo ainda estiver aberto e sem acordo, o motor gera uma notificação interna ao consultor. Esse aviso é vinculado ao ciclo, registrado no histórico e protegido contra duplicação.

Em 03/11/2026, caso continue sem acordo, o motor encerra o ciclo como Prazo expirado, prepara uma mensagem pendente para o proprietário e retorna o atendimento a Envio de imóveis. As propostas, aceites e datas são preservados. A aplicação deixa explícito que a mensagem foi gerada e permanece pendente; não afirma ter enviado e-mail ou WhatsApp.

Quando cliente e proprietário aceitam a mesma proposta antes do vencimento, o sistema registra o acordo, encerra a contagem e avança para Reunião e documentação. As verificações posteriores reconhecem o acordo e impedem expiração indevida.

Contrapropostas criam novas identidades e novos aceites, mas não reiniciam os 14 dias. O autor já concorda com seu próprio valor; a outra parte precisa confirmar. Propostas substituídas continuam disponíveis como histórico. Um acordo já concluído não admite novas contrapropostas dentro do mesmo ciclo nesta demonstração.

## 5. Decisões técnicas

### 5.1 Recursos nativos e operação local

O uso de Node.js nativo reduz dependências e facilita a execução no Windows. Não há Firebase, serviço pago, banco em nuvem, biblioteca de interface ou API externa obrigatória. A aplicação não precisa de internet depois de o Node estar disponível.

### 5.2 Motor compartilhado e auditável

A interface e a CLI chamam o mesmo motor, evitando divergências entre a demonstração visual e o processamento de regras. Cada execução conserva condições, ações e estados anteriores/posteriores. As execuções repetidas aparecem na auditoria, enquanto os efeitos de negócio permanecem únicos.

### 5.3 Integridade de propostas e valores

Valores são guardados em centavos inteiros. Cada aceite identifica a proposta a que se refere. O backend verifica etapa, prazo, autor, identidade da proposta e revisão dos dados; esconder um botão não é a única proteção contra transições inconsistentes.

### 5.4 Experiência de uso

O painel possui identidade própria, tema escuro, indicadores, busca, filtros, detalhes de atendimento, histórico e central de notificações. Datas e valores usam formato brasileiro. Status possuem texto além da cor, formulários têm rótulos e os controles apresentam foco visível. O layout se adapta a desktop e celular.

### 5.5 Referência temporal explícita

A demonstração começa em 25/10/2026. O simulador avança uma referência persistida, sem alterar o relógio do computador. Retroceder é bloqueado para preservar a sequência dos fatos; o comando de restauração permite repetir a apresentação com backup dos dados anteriores.

## 6. Resultados comprovados

Foram executados **37 testes automatizados com `node:test`, todos aprovados, sem falhas ou testes ignorados**. A suíte cobre os dez requisitos de teste solicitados e verificações adicionais de integração, incluindo restauração HTTP, logs auditáveis e o roteiro completo. Os resultados desta entrega estão em [RESULTADOS_DOS_TESTES.md](RESULTADOS_DOS_TESTES.md).

| Grupo | Evidência obtida |
| --- | --- |
| Datas e vencimento | Cálculo de 14 dias, viradas de mês/ano, ano bissexto e resultados equivalentes em três fusos. |
| Avisos e expiração | Aviso exatamente um dia antes, expiração no limite e retorno à busca. |
| Acordos | Acordo válido impede expiração; aceite fora do prazo é recusado. |
| Contrapropostas | Aceites antigos não valem para nova proposta; prazo original é mantido. |
| Histórico e isolamento | Ciclos anteriores preservados; aceites e documentos de outro ciclo não satisfazem o atual. |
| Idempotência | Repetições não duplicam avisos ou encerramentos. |
| Persistência | Mudanças sobrevivem à reabertura do armazenamento e de uma instância HTTP. |
| Concorrência | CLI e servidor compartilham arquivo; transações concorrentes não perdem eventos; corrida entre aceite e expiração termina em estado coerente. |
| Arquivos e API | Upload/download real, validações de entrada, conflitos de revisão, backup e tratamento de corrupção. |

A interface também foi exercitada em Microsoft Edge com larguras de **375, 768, 1024 e 1440 px**, sem transbordamento horizontal da página. Foram concluídos pelo navegador: novo atendimento até primeira proposta, aceite de contraproposta, agendamento da reunião, ficha cadastral, upload real, encaminhamento e a sequência de simulações em 02/11 e 03/11. Não foram observados erros JavaScript da aplicação durante essa validação.

Capturas e registros estão na pasta `docs/evidencias`. Os testes podem ser repetidos com `npm.cmd test`; os dados temporários de teste são independentes dos dados de apresentação. Os resultados demonstram o comportamento verificado, sem constituir medição de produtividade em uma imobiliária real.

## 7. Limitações conhecidas

- Não há integração ativa com Bitrix24, Trello, e-mail ou WhatsApp.
- As mensagens externas permanecem pendentes. A apresentação de imóveis prepara links locais, sem transmissão a clientes.
- Não existe agendador configurado. O motor é executado manualmente ou pela CLI. A consulta periódica do painel apenas atualiza a visualização.
- O armazenamento em JSON foi escolhido para demonstração local. Não oferece escala de banco transacional, redundância, criptografia de documentos ou recuperação completa de falhas físicas.
- A aplicação escuta em loopback e não possui autenticação ou perfis de acesso. Deve utilizar dados e documentos fictícios.
- Os anexos são limitados a 2 MB e 10 por ciclo. Não há verificação de autenticidade documental, validação de CPF ou antivírus integrado.
- Datas de negócio têm precisão diária. Horários de visita/reunião são registrados, mas a elegibilidade para realização considera o dia.
- O mesmo cliente pode ter atendimentos separados; não existe cadastro mestre nem resolução automática de duplicidades.
- Renegociação após um acordo concluído, assinatura, cobrança, gestão financeira e análise jurídica estão fora do escopo.
- A validação de interface foi feita no Edge e em tamanhos de tela simulados, sem certificação formal de acessibilidade ou testes em todos os aparelhos físicos.

## 8. Evolução e possível integração com Bitrix24

Uma integração futura poderia transportar propostas, estados e eventos para o CRM por API REST. Para isso, seria necessário verificar disponibilidade dos recursos no plano utilizado, permissões e métodos de autenticação, além de mapear entidades e definir a fonte oficial dos dados.

Recomenda-se manter o motor independente e criar um adaptador de integração responsável por comunicação, identificadores externos, tratamento de erros e idempotência. Credenciais precisariam ser administradas fora do código. O envio efetivo de notificações exigiria um provedor ou recurso autorizado e estados distintos de tentativa, sucesso e falha.

A CLI já fornece uma entrada adequada a uma execução futura pelo Agendador de Tarefas do Windows. Essa configuração não foi realizada. Seu funcionamento dependeria do computador disponível, das permissões de arquivo e de uma referência temporal compatível com a data real.

## 9. Benefícios esperados para a imobiliária

A solução demonstra como regras explícitas podem apoiar uma operação de locação com acompanhamento padronizado de prazos, registro de decisões e prevenção de aceites inconsistentes. O histórico permite recuperar o motivo de uma mudança de etapa e identificar o imóvel e a proposta envolvidos.

O aviso de prazo próximo sinaliza ao consultor uma ação necessária. O retorno à busca após expiração evita que um atendimento permaneça indefinidamente preso a uma negociação sem acordo. A preservação dos ciclos permite aprender com tentativas anteriores sem confundir seus valores e datas.

Esses benefícios são expectativas fundamentadas no comportamento implementado. Não foram medidos ganhos financeiros, conversão, redução percentual de trabalho ou resultados em produção.

## 10. Conclusão

O LocaFlux entrega uma demonstração executável da automação imobiliária, com regras de negócio independentes da interface, persistência local, histórico e resultados verificáveis. A regra dos 14 dias produz desfechos distintos para ausência de acordo e aceite válido, mantendo a rastreabilidade de contrapropostas e novos ciclos.

Como complemento ao Kanban já desenvolvido, a solução evidencia competências de modelagem, JavaScript, Node.js, validação, testes e atenção à experiência de uso. Seu escopo e suas limitações são explícitos, permitindo apresentar a capacidade técnica sem atribuir ao sistema integrações ou envios que não foram implementados.

---

**Material para apresentação:** este relatório está em Markdown e pode ser exportado posteriormente para PDF por um editor compatível. As capturas em `docs/evidencias` podem ser utilizadas como anexos. Os nomes e cenários apresentados são fictícios.
