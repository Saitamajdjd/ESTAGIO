# Instalação e operação

## O projeto

LocaFlux é uma demonstração complementar para o case NIA: representa a jornada de locação, executa a regra de negociação de 14 dias e registra suas decisões. Interface em português brasileiro, tema escuro, responsividade, valores em reais e datas brasileiras. Dados de clientes e imóveis são fictícios.

O sistema roda no Windows, sem banco em nuvem, serviços pagos, API externa obrigatória ou bibliotecas de execução. JavaScript com módulos ES tanto no servidor quanto no navegador.

## Instalação

Instale Node.js 24 LTS pelo [site oficial](https://nodejs.org/en/download), se ainda não estiver disponível. Validação realizada com Node 24.15.0 / npm 11.12.1.

```powershell
cd "C:\Users\valeu\Downloads\projetos\estagio desafio"
node --version
npm.cmd install
npm.cmd start
```

Acesse **http://localhost:3000**. O servidor escuta apenas em `127.0.0.1`. Não exige login; é um ambiente local de demonstração. A adaptação móvel pode ser vista no modo de dispositivos do navegador. O telefone físico não acessa esse endereço de loopback do computador.

Os arquivos prontos dispensam compilação. A primeira leitura cria os dados fictícios se o arquivo ainda não existir. `Ctrl+C` encerra o servidor. Iniciá-lo novamente preserva as alterações.

## Comandos

| Comando | Efeito |
| --- | --- |
| `npm.cmd install` | Confere pacote e lockfile; não instala dependências externas. |
| `npm.cmd start` | Inicia o servidor na porta 3000. |
| `npm.cmd run dev` | Inicia com observação de alterações pelo Node. |
| `npm.cmd test` | Executa testes unitários e de integração com `node:test`. |
| `npm.cmd run test:browser` | Validação opcional da interface com Microsoft Edge instalado no Windows. |
| `npm.cmd run check` | Verifica sintaxe da interface e do servidor. |
| `npm.cmd run verify` | Avalia todos os ciclos na data atual do Windows. |
| `npm.cmd run verify -- --date 2026-11-02` | Executa o mesmo motor na data informada. |
| `npm.cmd run reset` | Faz backup e restaura os cinco cenários em 25/10/2026. |
| `.\iniciar-demo.cmd` | Atalho Windows para iniciar o servidor, a partir da pasta do projeto. |
| `.\restaurar-demo.cmd` | Atalho Windows para restaurar os dados e guardar backup. |

Os comandos de verificação alteram **o mesmo `data/store.json`** usado pelo servidor, mesmo quando executados com o painel aberto. O painel consulta atualizações a cada 15 segundos quando não há edição ativa. Também há um botão Atualizar. Essa consulta de dados **não executa o motor de regras**.

## Referência temporal

O painel começa em **25/10/2026**, independentemente da data real. Toda ação interativa usa a referência visível. Avance pelo Simulador de Execução. A CLI sem `--date` usa a data local atual do computador e a define como nova referência.

Não é permitido voltar no tempo: se você simulou novembro e a data real ainda está em outubro, `npm.cmd run verify` recusará a execução. Informe uma data igual ou posterior à referência, ou restaure a demonstração. O relógio e o fuso do Windows nunca são alterados.

A expiração vale desde o início da data limite civil; não se trata de 336 horas a partir de um horário. Uma proposta em 20/10/2026 vence em 03/11/2026. O último dia elegível para acordo é 02/11/2026.

## Dados, backup e restauração

- Estado principal: `data/store.json`.
- Arquivo temporário de bloqueio: `data/store.json.lock`.
- Backups criados pela restauração: `data/backups/store-<identificador>.json`.
- Anexos: conteúdo em base64 dentro do JSON, até 2 MB por arquivo e 10 documentos por ciclo.

```powershell
npm.cmd run reset
```

Depois atualize o painel. Também é possível usar **Simulador de Execução → Restaurar demonstração → Restaurar dados iniciais**; nesse caso o painel é atualizado automaticamente. A restauração pode ocorrer com o servidor aberto porque usa o mesmo bloqueio. Os formulários abertos anteriormente recebem conflito de revisão e precisam ser refeitos.

Para recuperar um backup, encerre o servidor e qualquer CLI em execução, copie o backup escolhido sobre `data/store.json` e reinicie. Guarde também uma cópia do arquivo que será substituído. Não edite o JSON enquanto servidor/CLI estiverem escrevendo.

Se houver interrupção abrupta durante uma gravação, um arquivo `.lock` poderá permanecer. O programa não remove automaticamente um bloqueio cuja propriedade não pode garantir. Confirme que os processos do projeto foram encerrados, consulte o PID em `data/store.json.lock` e então remova **somente esse arquivo** antes de reiniciar. Dados inválidos não são substituídos silenciosamente.

## Porta ocupada

```powershell
$env:PORT = "3001"
npm.cmd start
```

Abra `http://localhost:3001`. Para voltar ao padrão em outro comando da mesma sessão:

```powershell
Remove-Item Env:PORT
```

Opcionalmente, `DATA_FILE` define outro arquivo de dados. Se usado, configure **o mesmo caminho absoluto** no servidor e na CLI. O uso normal não precisa dessa variável. Os testes a utilizam apenas para isolar seus dados temporários dos dados de apresentação.

## Estrutura

```text
public/
  index.html             Estrutura acessível da aplicação
  styles.css             Tema escuro e layouts responsivos
  app.js                 Interface, formulários e chamadas HTTP
  favicon.svg            Identidade própria LocaFlux
src/
  dates.js               Datas civis e cálculo dos prazos
  domain.js              Entidades, validações e máquina de estados
  automation.js          Avaliação de regras e relatório de execução
  storage.js             JSON, bloqueio, transação, backup e restauração
  seed.js                Construção dos cinco cenários fictícios
  view.js                Indicadores e projeção pública sem base64
  server.js              HTTP local, API e download de documentos
  cli.js                 Verificação por terminal e restauração
data/
  store.json             Único arquivo de dados da aplicação
tests/
  automation.test.js     Regras, limites e isolamento entre ciclos
  integration.test.js    HTTP, CLI, concorrência, arquivos e persistência
  helpers.js             Preparação isolada dos testes
  browser-check.mjs      Validação opcional de interface via CDP, sem bibliotecas
docs/
  README.md
  ARQUITETURA.md
  REGRAS_DE_NEGOCIO.md
  CENARIOS_DE_TESTE.md
  RELATORIO_TECNICO.md
  evidencias/            Capturas e registros da validação
package.json
package-lock.json
README.md
```

## Tratamento de erros

Campos e etapas são validados no servidor. A interface apresenta mensagens legíveis e mantém o diálogo aberto quando uma ação falha. Alterações com revisão antiga recebem HTTP 409, atualizam os dados e exigem nova ação explícita. Não há repetição automática de um aceite antigo.

Documentos podem ser baixados somente pela rota dedicada; o conteúdo base64 não é enviado no estado geral. Rotas estáticas usam lista de arquivos permitidos. Cabeçalhos CSP, checagem de origem e host e JSON obrigatório reduzem exposição acidental do serviço local; não substituem autenticação para uma implantação real.
