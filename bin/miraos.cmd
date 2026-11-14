@echo off
rem MiraOS launcher — runs the source build (packages\cli\dist\index.js).
rem Build first: npm run build
chcp 65001 >nul 2>nul
setlocal
set "ROOT=%~dp0.."

if not exist "%ROOT%\packages\cli\dist\index.js" (
  echo miraos: packages\cli\dist\index.js is missing. 1>&2
  echo miraos: run "npm run build" in %ROOT% first. 1>&2
  exit /b 1
)

if not defined NODE_BINARY set "NODE_BINARY=node"
"%NODE_BINARY%" "%ROOT%\packages\cli\dist\index.js" %*
exit /b %ERRORLEVEL%