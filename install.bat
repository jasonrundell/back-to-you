@echo off
:: Back to You - installer shim for Windows.
::
::   install.bat            pick a voice pack, or switch the active one
::   install.bat mytheme    activate mytheme without prompting
::
:: This used to be the installer. It is now a shim: the real one is bin\cli.js,
:: and there is exactly one implementation of it. See docs\adr\0001 for why.
::
:: Keep this file ASCII-only with CRLF line endings; cmd mis-parses "::"
:: comments containing non-ASCII characters when the file uses LF endings.
setlocal

set "DIR=%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Back to You needs Node.js, and "node" is not on your PATH.
  echo Install it from https://nodejs.org and run this again.
  pause
  exit /b 1
)

node "%DIR%bin\cli.js" %*
set "STATUS=%ERRORLEVEL%"

:: Double-clicked from Explorer the window would close before the output could
:: be read, which is the whole reason this file exists rather than a bare npx.
pause
exit /b %STATUS%
