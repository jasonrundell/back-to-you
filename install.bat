@echo off
:: Voice sound notifications - Claude Code / Cowork installer (Windows)
:: Keep this file ASCII-only with CRLF line endings; cmd mis-parses "::" comments
:: that contain non-ASCII characters when the file uses LF endings.
::
::   install.bat            installs every theme, prompts you to pick one
::   install.bat mytheme    installs every theme, activates sounds\mytheme
setlocal EnableDelayedExpansion

set SCRIPT_DIR=%~dp0
set CLAUDE_DIR=%USERPROFILE%\.claude

set THEME=%~1

if not "%THEME%"=="" goto :theme_chosen

:: No theme argument - list the packs on disk and ask which one to activate.
set PACK_COUNT=0
set DEFAULT_PICK=1
echo Choose a voice pack:
echo.
for /d %%T in ("%SCRIPT_DIR%sounds\*") do (
  set /a PACK_COUNT+=1
  set "PACK_!PACK_COUNT!=%%~nxT"
  if "%%~nxT"=="claude" set DEFAULT_PICK=!PACK_COUNT!
)
for /l %%N in (1,1,!PACK_COUNT!) do (
  if "%%N"=="!DEFAULT_PICK!" (
    echo   %%N^) !PACK_%%N! ^(default^)
  ) else (
    echo   %%N^) !PACK_%%N!
  )
)
echo.
set /p PICK="Pick a number [!DEFAULT_PICK!]: "
if "%PICK%"=="" set PICK=%DEFAULT_PICK%
set THEME=!PACK_%PICK%!
if "%THEME%"=="" (
  echo ERROR: "%PICK%" isn't one of the choices above.
  pause
  exit /b 1
)
echo.

:theme_chosen

if not exist "%SCRIPT_DIR%sounds\%THEME%\" (
  echo ERROR: No theme folder at "%SCRIPT_DIR%sounds\%THEME%"
  echo Available themes:
  for /d %%T in ("%SCRIPT_DIR%sounds\*") do echo   %%~nxT
  pause
  exit /b 1
)

echo Installing sound notifications for Claude Code / Cowork (Windows)...
echo   Active theme: %THEME%
echo.

dir /b "%SCRIPT_DIR%sounds\%THEME%\task-complete\*.*" >nul 2>nul
if errorlevel 1 (
  echo ERROR: No sounds in "%SCRIPT_DIR%sounds\%THEME%\task-complete"
  echo Add at least one .mp3 or .wav to that folder and run this installer again.
  pause
  exit /b 1
)

dir /b "%SCRIPT_DIR%sounds\%THEME%\decision-needed\*.*" >nul 2>nul
if errorlevel 1 (
  echo ERROR: No sounds in "%SCRIPT_DIR%sounds\%THEME%\decision-needed"
  pause
  exit /b 1
)

:: Create directories
if not exist "%CLAUDE_DIR%\hooks" mkdir "%CLAUDE_DIR%\hooks"
if not exist "%CLAUDE_DIR%\sounds" mkdir "%CLAUDE_DIR%\sounds"

:: Install every theme found under sounds\, so custom packs come along too
xcopy /Y /E /I "%SCRIPT_DIR%sounds" "%CLAUDE_DIR%\sounds" >nul
if errorlevel 1 (
  echo ERROR: Copying sounds failed.
  pause
  exit /b 1
)
echo   OK Sound themes copied

:: Record the active theme
> "%CLAUDE_DIR%\sound-theme.txt" echo %THEME%
echo   OK Active theme set to %THEME%

:: Copy Claude hook scripts
copy /Y "%SCRIPT_DIR%hooks\play-sound.ps1" "%CLAUDE_DIR%\hooks\play-sound.ps1" >nul
copy /Y "%SCRIPT_DIR%hooks\play-category.ps1" "%CLAUDE_DIR%\hooks\play-category.ps1" >nul
echo   OK Hook scripts installed

:: Merge the hook entries into Claude settings.json. The merge lives in its own
:: PowerShell file because five hook entries, two of them carrying matchers, do
:: not fit legibly into a batch one-liner continued with carets.
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%tools\merge-settings.ps1" -SettingsPath "%CLAUDE_DIR%\settings.json" -HookDir "%CLAUDE_DIR%\hooks"
if errorlevel 1 (
  echo.
  echo ERROR: Could not update settings.json. Nothing else has been changed.
  pause
  exit /b 1
)

echo.
echo All done! Restart Claude Code / Cowork to activate sound notifications.
echo To switch themes later, edit %CLAUDE_DIR%\sound-theme.txt
pause
