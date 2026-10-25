# Roteiro da gravação local

O projeto existente foi mantido: interface em JavaScript, servidor HTTP nativo do Node, motor de regras e armazenamento JSON. Todos os nomes e imóveis são fictícios. Nenhum passo exige hospedagem, conta de CRM ou envio externo.

## 1. Preparar e iniciar no Windows

Instale Node.js 24 ou superior com npm. Abra o PowerShell na pasta do projeto:

```powershell
npm.cmd install
.\restaurar-demo.cmd
.\iniciar-demo.cmd
```

`npm.cmd install` não instala bibliotecas externas; o projeto não tem dependências. Os atalhos equivalem a `npm.cmd run reset` e `npm.cmd start`. A restauração guarda backup do estado anterior. Abra **http://localhost:3000** e mantenha o terminal do servidor aberto. Ao terminar, encerre com `Ctrl+C`.

Para gravar uma demonstração limpa, use **Simulador de Execução → Restaurar demonstração → Restaurar dados iniciais**. A referência será **25/10/2026**. O relógio do Windows não muda.

## 2. Mostrar os dois casos separados

No Simulador, os cartões exibem dados lidos do armazenamento:

| Caso | Proposta | Início | Prazo | Aceites iniciais |
| --- | --- | --- | --- | --- |
| João Silva · LOC-1001 · Casa 2055 | R$ 1.950,00 | 20/10/2026 | 03/11/2026 | Cliente como autor; proprietário ainda não aceitou. |
| Ana Costa · LOC-1004 · Apartamento 804 | R$ 2.400,00 | 20/10/2026 | 03/11/2026 | Cliente em 20/10 como autor e proprietário em 22/10. |

Abra **Ver proposta e aceites** de Ana. Mostre os dois aceites associados ao mesmo identificador de proposta, ambos anteriores ao prazo, e o status **Aceita**. O aceite do autor é registrado automaticamente quando ele propõe o valor; o proprietário é confirmado por uma ação de domínio. A preparação dos cenários chama essas mesmas funções usadas pela interface. Feche o diálogo.

Fala sugerida: “As duas negociações começaram em 20 de outubro e têm o mesmo prazo. João ainda aguarda o proprietário. Ana já tem um acordo válido na mesma proposta.”

## 3. Aviso de 02/11/2026

1. Clique no atalho **02/11/2026**. Ele preenche o campo de data.
2. Clique em **Executar verificação**. Este botão chama a API e o motor real, que grava o resultado no JSON.
3. João deve mostrar **Prazo próximo**, **1 dia restante** e continuar em **Negociação e documentação**.
4. No log de João, mostre `Falta exatamente 1 dia = Verdadeiro`, `Acordo válido = Falso` e a criação do aviso.
5. Abra os detalhes de João → **Notificações**. Mostre o aviso ao consultor de que há apenas um dia restante. Não marque como lido se quiser conservar os contadores deste roteiro.
6. Feche o diálogo e execute novamente a mesma data. O log mostra **0 eventos criados · 0 notificações criadas** e o resultado **Aviso existente: duplicação evitada** para João.

Fala sugerida: “A regra verificou o prazo e gerou um aviso persistido para o consultor. Repetir a execução não cria outro aviso.”

## 4. Encerramento de 03/11/2026

1. Clique em **03/11/2026 → Executar verificação**.
2. João deve mostrar **Prazo expirado**, encerramento em **03/11/2026** e etapa **Envio de imóveis**.
3. No log de João, mostre prazo atingido, ausência de acordo e as três ações: encerrar ciclo, gerar mensagem pendente e retornar à busca.
4. Compare os estados anterior/posterior. Em **Alterações e registros desta negociação**, mostre os campos alterados e os IDs dos eventos/notificação criados.
5. Abra João → **Notificações**: a mensagem para **Carlos Almeida** está **Pendente de envio**. Nenhuma mensagem foi transmitida.
6. Em **Histórico**, mostre o encerramento, a notificação e a troca de etapa. Em **Propostas e ciclos**, confirme que a proposta original foi preservada.

Fala sugerida: “Em 3 de novembro, passaram 14 dias corridos desde a primeira proposta. Sem acordo, o motor encerrou o ciclo, devolveu o atendimento à busca e preparou uma mensagem ao proprietário.”

## 5. Comprovar a proteção do acordo

Feche João e mostre separadamente o cartão de Ana. Ela continua em **Acordo registrado** e **Reunião e documentação**. Abra seus aceites novamente: os registros de 20/10 e 22/10 continuam presentes. Na aba **Notificações**, não há mensagem de expiração para ela.

No log da execução, localize **LOC-1004 · Ana Costa**. `Acordo válido` e os dois aceites são verdadeiros, mesmo com o prazo atingido. O resultado é **Acordo válido: protegido contra expiração**. Não há ações nem campos alterados para esse ciclo.

Fala sugerida: “O prazo também chegou para Ana, mas ambos aceitaram a mesma proposta antes do limite. O motor preservou o acordo e não a devolveu à busca.”

## 6. Repetir, mostrar logs e recarregar

Execute **03/11/2026** novamente. A execução registra zero ações, zero eventos e zero notificações novos. A lista de logs cresce porque a verificação é auditada; o histórico de negócio não ganha outro encerramento.

No relatório, mostre:

- As oito condições verificadas por ciclo, inclusive os dois aceites na proposta atual.
- **Horário simulado: 03/11/2026 às 00:00:00 UTC**, referência civil usada pelo cálculo diário.
- **Registro real**, apresentado no fuso do navegador.
- Resultado, ações, estado anterior/posterior, campos alterados e IDs criados.
- **Log completo da execução (JSON)** e os logs anteriores na parte inferior da página.

O horário simulado representa o início da data civil, não um prazo de 336 horas desde um horário de proposta. Não há seletor de horas para a regra. As alterações estão persistidas em `data/store.json`. Pressione `F5`: os estados e os logs continuam presentes.

## Contadores do roteiro principal

Estes números consideram restauração seguida diretamente de 02/11 e 03/11, sem executar 25/10 nem editar os outros cenários:

| Execução | Ações | Novos eventos de negócio | Novas notificações | Notificações acumuladas |
| --- | ---: | ---: | ---: | ---: |
| Estado restaurado | — | — | — | 1 |
| 02/11 · primeira vez | 5 | 6 | 3 | 4 |
| 02/11 · repetição | 0 | 0 | 0 | 4 |
| 03/11 · primeira vez | 6 | 8 | 2 | 6 |
| 03/11 · repetição | 0 | 0 | 0 | 6 |

O motor avalia os cinco ciclos. Pedro já começa expirado e com uma mensagem pendente. Em 02/11, Mariana expira, enquanto João e Lucas recebem avisos. Em 03/11, João e Lucas expiram. Ana mantém o acordo em todas as execuções. Por isso os totais incluem mais alterações que apenas as de João. A validação real deste roteiro está em [evidencias/demonstracao.json](evidencias/demonstracao.json).

## Restaurar ou demonstrar pelo terminal

Com o servidor aberto, use outro PowerShell na mesma pasta:

```powershell
.\restaurar-demo.cmd
npm.cmd run verify -- --date 2026-11-02
npm.cmd run verify -- --date 2026-11-02
npm.cmd run verify -- --date 2026-11-03
npm.cmd run verify -- --date 2026-11-03
```

Clique em **Atualizar dados** no painel. CLI e interface compartilham o mesmo estado e as mesmas regras. Para voltar a outubro, restaure; a simulação recusa retrocesso. A restauração pela interface atualiza o painel automaticamente.

Não há integração com Bitrix24, e-mail ou WhatsApp. Não há agendador: as regras são executadas pelo botão ou pelo comando. Fechar navegador e servidor não deixa nenhuma automação contínua em funcionamento. O servidor precisa estar aberto para usar a interface; a CLI pode rodar como um processo independente e termina ao concluir a verificação.
