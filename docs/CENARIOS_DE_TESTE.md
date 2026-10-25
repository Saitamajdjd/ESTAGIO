# Cenários de teste e demonstração

## Preparação

```powershell
npm.cmd install
npm.cmd run reset
npm.cmd start
```

Abra `http://localhost:3000`. Deixe o servidor aberto; use outro PowerShell para CLI ou testes. Todos os cenários são fictícios. Os testes automatizados usam arquivos temporários, sem alterar `data/store.json`.

## Estado inicial esperado

Referência: **25/10/2026**.

| Código | Cliente | Imóvel | Proposta atual | Início | Limite | Situação |
| --- | --- | --- | --- | --- | --- | --- |
| LOC-1001 | João Silva | Casa 2055 | R$ 1.950,00 | 20/10/2026 | 03/11/2026 | Em andamento; 9 dias restantes. |
| LOC-1002 | Mariana Santos | Apartamento 301 | R$ 2.650,00 | 12/10/2026 | 26/10/2026 | Próxima do prazo; 1 dia restante; aviso ainda não gerado. |
| LOC-1003 | Pedro Oliveira | Casa 1020 | R$ 3.000,00 | 11/10/2026 | 25/10/2026 | Expirado; retorno à busca e mensagem pendente já registrados. |
| LOC-1004 | Ana Costa | Apartamento 804 | R$ 2.400,00 | 20/10/2026 | 03/11/2026 | Acordo em 22/10; etapa Reunião e documentação. |
| LOC-1005 | Lucas Ferreira | Studio 112 | R$ 1.750,00 | 20/10/2026 | 03/11/2026 | Contraproposta do proprietário em 22/10; falta aceite do cliente. |

O cenário expirado é preparado pelo próprio motor ao criar os dados, com uma execução de origem `demo`. Não representa e-mail efetivamente enviado. Indicadores iniciais: **3 abertos, 1 próximo, 1 expirado, 1 com acordo, 1 notificação pendente**.

## Demonstração A — regra de 14 dias e idempotência

1. Abra **Simulador de Execução** e execute **25/10/2026**.
2. Mariana deve ter `Falta exatamente 1 dia = Verdadeiro`, `Acordo válido = Falso`, `Aviso já gerado anteriormente = Falso`. A ação gera aviso ao consultor.
3. Repita **25/10/2026**. A condição de aviso anterior passa a Verdadeiro. O relatório mostra zero ações. A execução é auditada, mas não há outra notificação.
4. Execute **02/11/2026**. João e Lucas recebem avisos; Mariana expira; Pedro continua expirado; Ana mantém o acordo.
5. Execute **03/11/2026**. João e Lucas expiram. Seus atendimentos voltam para Envio de imóveis, preservando propostas e ciclos. Cada um recebe mensagem ao proprietário **pendente de envio**.
6. Repita **03/11/2026**. Zero ações novas e nenhum segundo encerramento.
7. Abra João → Histórico e Propostas e ciclos: verifique datas, motivo e preservação da proposta de R$ 1.950,00.

Sem outros cliques de aceite ou leitura, os indicadores esperados são:

| Referência / ação | Abertos | Próximos | Expirados | Com acordo | Notificações pendentes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Restauração | 3 | 1 | 1 | 1 | 1 |
| Executar 25/10 | 3 | 1 | 1 | 1 | 2 |
| Executar 02/11 | 2 | 2 | 2 | 1 | 5 |
| Executar 03/11 | 0 | 0 | 4 | 1 | 7 |

Marcar um aviso como lido reduz o indicador de pendentes. Isso não permite regenerar o aviso. Se pular a execução em 25/10, Mariana expira sem aviso retroativo e o total posterior de notificações será um a menos.

## Demonstração B — acordo antes do prazo

1. Restaure os dados e atualize o painel.
2. Abra João. A proposta atual já tem o aceite implícito do cliente, seu autor.
3. Clique **Confirmar aceite** do proprietário em 25/10 ou após simular 02/11.
4. O ciclo muda para Acordo registrado e o atendimento vai para Reunião e documentação.
5. Execute 03/11. O relatório indica acordo válido; João não expira e não recebe mensagem de expiração.

## Demonstração C — contraproposta invalida os aceites anteriores

1. Restaure e abra Lucas → **Propostas e ciclos**.
2. A proposta de R$ 1.650,00 aparece como Substituída, com aceite do cliente como autor.
3. A proposta de R$ 1.750,00 aparece como Aguardando aceite, com aceite somente do proprietário.
4. A data inicial continua 20/10 e o prazo continua 03/11.
5. Volte ao resumo e confirme o aceite do cliente: acordo válido e avanço para reunião.

Alternativa: em João, registre uma contraproposta do proprietário. O aceite do cliente deve voltar a faltar para o novo valor. Uma tentativa via API de aceitar o ID da proposta antiga retorna 409, coberta pela suíte.

## Demonstração D — novo ciclo após expiração

1. Restaure e abra Pedro, cujo ciclo 1 está expirado.
2. Em **Apresentar outros imóveis**, selecione Casa 2055 e registre a seleção.
3. Escolha Casa 2055 em Imóvel de interesse, mantenha 25/10 e solicite disponibilidade.
4. Confirme o horário do proprietário e registre a visita realizada.
5. Inicie a negociação com valor R$ 1.900,00 e autor Cliente.
6. O ciclo 2 começa em **25/10**, vence em **08/11** e tem apenas o aceite do autor.
7. A aba Propostas e ciclos mantém o ciclo 1 da Casa 1020, de 11/10 a 25/10, expirado.

Os indicadores continuam contando a expiração histórica, mesmo que o ciclo atual esteja aberto.

## Demonstração E — visita, disponibilidade e desistência

1. Crie um novo atendimento com nome e necessidades fictícios.
2. Apresente imóveis e solicite visita para um imóvel da lista.
3. Use **Horário indisponível? Sugerir outra data**, com motivo.
4. O estado continua aguardando o proprietário. Confirme o novo horário.
5. Se a data da visita for futura, use o simulador para avançar até ela antes de registrar realização.
6. Após realizar, escolha **Cliente quer buscar outros imóveis**: volta para Envio de imóveis.
7. Alternativamente, encerre por Desistência, Recusa da visita ou Falta de interesse. Consulte o motivo no histórico.

## Demonstração F — ficha, arquivo e contratos

1. Restaure e abra Ana.
2. Agende a reunião em 25/10, referência inicial.
3. Abra Documentação, preencha nome, contato e dados fictícios, e registre a ficha.
4. Crie um `.txt` de teste sem dados pessoais ou escolha um PDF fictício de até 2 MB.
5. Anexe o arquivo. Clique no nome para baixar e conferir seu conteúdo.
6. Clique **Encaminhar arquivos**. O atendimento alcança Encaminhado ao setor de contratos.
7. A tentativa de encaminhar sem ficha ou sem documento é recusada pelo servidor.

O encaminhamento é local e auditado; não envia arquivos ao Bitrix24 ou a terceiros.

## Demonstração G — terminal e persistência

```powershell
npm.cmd run reset
npm.cmd run verify -- --date 2026-11-02
npm.cmd run verify -- --date 2026-11-03
```

Atualize a interface: ela deve refletir exatamente as mudanças da CLI. O terminal mostra condições, estados e ações. Encerre o servidor com Ctrl+C e inicie com `npm.cmd start`; a referência continua 03/11 e os ciclos permanecem encerrados.

`npm.cmd run verify` sem data utiliza a data atual do Windows. Depois de simular o futuro, uma data atual anterior à referência será recusada. Restaure antes de demonstrar esse modo.

## Suíte automatizada

```powershell
npm.cmd test
```

Resultado verificado: **37 testes, 37 aprovados, 0 falhas, 0 ignorados**. O runner nativo retorna código de saída diferente de zero se houver falha. Consulte [o relatório da execução real](RESULTADOS_DOS_TESTES.md).

| Requisito solicitado | Cobertura em `automation.test.js` |
| --- | --- |
| Cálculo dos 14 dias | Teste 01; virada de mês, ano e ano bissexto. |
| Aviso um dia antes | Teste 02; ausência em dia anterior. |
| Expiração sem acordo | Teste 03; snapshot e mensagem pendente. |
| Acordo impede expiração | Teste 04; verificação meses depois. |
| Invalidação após contraproposta | Teste 05 e rejeição explícita de ID antigo. |
| Sem duplicação | Teste 06; avisos e encerramento. |
| Novo ciclo com novas datas | Teste 07; novo imóvel, prazo e aceites. |
| Retorno à busca | Teste 08; limpeza da visita e nova seleção. |
| Preservação do histórico | Teste 09; eventos e proposta original. |
| Isolamento de imóveis/negociações | Teste 10; outros atendimentos e anexos de ciclos distintos. |

Também são testados três fusos horários, prazo limite de aceite, reagendamento, etapas indevidas, encerramento voluntário, valores inválidos, revisão concorrente, rollback de falhas, corrupção de arquivo, backup, CLI concorrente, download de anexos e corrida entre aceite e expiração.

## Validação da interface

Microsoft Edge em modo headless, controlado por protocolo CDP usando o próprio Node. Foram verificados layouts de 375, 768, 1024 e 1440 px, navegação, criação de atendimento, jornada até primeira proposta, aceite de contraproposta, ficha/anexo/encaminhamento e simulador. Nenhum erro JavaScript da aplicação foi observado.

As capturas e o registro dos resultados estão em [evidencias](evidencias/README.md). Essa validação complementa a suíte; não equivale a certificação de acessibilidade nem a testes em todos os navegadores ou aparelhos físicos.

Para reproduzi-la no Windows com Microsoft Edge instalado, execute `npm.cmd run test:browser`. O script usa um perfil temporário próprio e dados isolados em `.qa`, encerrando o navegador e o servidor ao finalizar.
