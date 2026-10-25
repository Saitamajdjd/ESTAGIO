# Entrega do código no GitHub

O repositório local foi inicializado na branch `main`. Nenhum remoto, commit ou publicação foi criado nesta preparação. O código funciona localmente sem hospedagem.

O `.gitignore` exclui o estado mutável (`data/*.json`, que também contém anexos), backups, locks, temporários, `.qa`, perfis de teste do navegador, dependências, logs, arquivos `.env` e credenciais locais comuns. Os dados fictícios são recriados por `src/seed.js` na primeira execução ou restauração. As evidências em `docs/evidencias` contêm somente dados fictícios de teste; os registros operacionais podem incluir o caminho local do projeto.

O `.gitattributes` define normalização dos arquivos de texto e finais de linha CRLF para os atalhos `.cmd` no checkout do Windows. `package-lock.json`, código, testes e documentação devem ser publicados.

Na pasta do projeto, revise e faça o primeiro commit:

```powershell
git status --short
git add .
git diff --cached --stat
git commit -m "Prepara demonstracao local do case NIA"
```

Crie um repositório vazio no GitHub e use a URL real dele:

```powershell
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git push -u origin main
```

Substitua os dois nomes antes de executar. O Git pode solicitar nome/e-mail de autor e autenticação da sua conta. Esses comandos publicam apenas o código; não hospedam a aplicação. A gravação pode ser anexada à entrega pelo canal escolhido.

Após clonar em outro computador Windows com Node 24 ou superior:

```powershell
npm.cmd install
npm.cmd test
.\restaurar-demo.cmd
.\iniciar-demo.cmd
```

Abra `http://localhost:3000` e siga [DEMONSTRACAO.md](DEMONSTRACAO.md).
