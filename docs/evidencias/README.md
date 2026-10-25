# Evidências de validação

Validação em 25/10/2026, no Windows, com Node.js 24.15.0, npm 11.12.1 e Microsoft Edge.

- `desktop.png`: painel em 1440 × 1080 px, com dados iniciais.
- `mobile.png`: painel em 375 × 1000 px.
- `simulador.png`: execução de 03/11/2026, com João expirado e Ana protegida.
- `aviso.png`: execução de 02/11/2026, com João a um dia do prazo.
- `acordo.png`: dois aceites de Ana na mesma proposta, registrados antes do prazo.
- `notificacao.png`: aviso interno e mensagem pendente ao proprietário de João.
- `demonstracao.json`: logs e estados extraídos do armazenamento real após cliques nas duas datas e suas repetições.
- `windows.json`: resultados reais dos atalhos Windows e quatro verificações por CLI com o servidor aberto.
- `navegador.json`: verificações concluídas pelo navegador e lista de erros JavaScript observados.
- `testes.txt`: saída da suíte automatizada executada na entrega.

O teste exercita aceites, novos atendimentos e documentação; em seguida, restaura os dados pela interface antes de executar o roteiro de 02/11 e 03/11. As capturas do simulador refletem esse roteiro a partir dos cinco cenários originais, sem a execução opcional de 25/10. Os dados de apresentação em `data/store.json` são independentes dos dados de teste.

Reproduza a suíte com:

```powershell
npm.cmd test
```

São 37 testes automatizados, sem dependências de terceiros. A verificação de navegador foi complementar, via CDP, e não é pré-requisito para instalar, iniciar ou testar as regras da aplicação. Resultados e limitações: [RESULTADOS_DOS_TESTES.md](../RESULTADOS_DOS_TESTES.md).

Para repetir a validação de interface no Windows com Edge instalado:

```powershell
npm.cmd run test:browser
```

O script usa dados temporários em `.qa`, cria seu próprio servidor/porta e perfil de navegador e atualiza as evidências. Não altera os dados da apresentação. `EDGE_PATH` pode indicar outro caminho do executável. O navegador de teste roda sem sandbox interno para compatibilidade com o ambiente restrito e acessa apenas o servidor local de validação; não utiliza seu perfil pessoal.

As mensagens de infraestrutura do Edge relativas a perfil, criptografia e registro do Windows, no ambiente restrito, não foram tratadas como erros da aplicação. O registro `navegador.json` documenta os erros JavaScript e de página coletados durante os fluxos.
