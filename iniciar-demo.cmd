@echo off
setlocal
pushd "%~dp0"
echo Abra no navegador o endereco Local informado abaixo. Ctrl+C encerra o servidor.
call npm.cmd start
set "DEMO_EXIT_CODE=%errorlevel%"
popd
exit /b %DEMO_EXIT_CODE%
