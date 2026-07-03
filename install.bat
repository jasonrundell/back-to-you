@echo off
:: StarCraft Sound Notifications — Combined Claude Code / Cowork and Cursor Installer (Windows)
:: Runs the dedicated Claude and Cursor installers. To set up only one tool, run
:: install-claude.bat or install-cursor.bat directly.
setlocal

set SCRIPT_DIR=%~dp0

echo Installing StarCraft sound notifications for Claude Code / Cowork and Cursor (Windows)...
echo.

call "%SCRIPT_DIR%install-claude.bat" nopause
if errorlevel 1 (
  echo ERROR: Claude setup failed.
  exit /b 1
)

echo.

call "%SCRIPT_DIR%install-cursor.bat" nopause
if errorlevel 1 (
  echo ERROR: Cursor setup failed.
  exit /b 1
)

echo.
echo All done! Restart Claude Code / Cowork and Cursor to activate sound notifications.
pause
