@echo off
setlocal
pushd "%~dp0"
call npm.cmd run reset
set "DEMO_EXIT_CODE=%errorlevel%"
popd
exit /b %DEMO_EXIT_CODE%
