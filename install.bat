@echo off
:: Chiptune sound notifications - Claude Code / Cowork installer (Windows)
:: Keep this file ASCII-only with CRLF line endings; cmd mis-parses "::" comments
:: that contain non-ASCII characters when the file uses LF endings.
::
::   install.bat            installs every theme, activates chiptune
::   install.bat mytheme    installs every theme, activates sounds\mytheme
setlocal

set SCRIPT_DIR=%~dp0
set CLAUDE_DIR=%USERPROFILE%\.claude

set THEME=%~1
if "%THEME%"=="" set THEME=chiptune

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
  echo Regenerate the chiptune theme with:
  echo   powershell -File tools\New-ChiptuneSounds.ps1 -OutputRoot sounds\chiptune
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
echo   OK Claude Stop hook script installed

copy /Y "%SCRIPT_DIR%hooks\play-sound-decision.ps1" "%CLAUDE_DIR%\hooks\play-sound-decision.ps1" >nul
echo   OK Claude Notification hook script installed

:: Write or merge Claude settings.json using PowerShell
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$settings = '%CLAUDE_DIR%\settings.json';" ^
  "$stopCmd = 'powershell -NoProfile -ExecutionPolicy Bypass -File \"%USERPROFILE%\.claude\hooks\play-sound.ps1\"';" ^
  "$notifCmd = 'powershell -NoProfile -ExecutionPolicy Bypass -File \"%USERPROFILE%\.claude\hooks\play-sound-decision.ps1\"';" ^
  "if (Test-Path $settings) {" ^
  "  $json = Get-Content $settings -Raw | ConvertFrom-Json;" ^
  "  if (-not $json.hooks) { $json | Add-Member -NotePropertyName hooks -NotePropertyValue ([PSCustomObject]@{}) };" ^
  "  $stopExists = $json.hooks.Stop | Where-Object { $_.hooks.command -like '*play-sound.ps1*' };" ^
  "  if (-not $stopExists) {" ^
  "    if (-not $json.hooks.Stop) { $json.hooks | Add-Member -NotePropertyName Stop -NotePropertyValue @() };" ^
  "    $json.hooks.Stop += @{ hooks = @(@{ type = 'command'; command = $stopCmd }) };" ^
  "    Write-Host '  OK Stop hook added to settings.json'" ^
  "  } else { Write-Host '  OK Stop hook already present - skipping' };" ^
  "  $notifExists = $json.hooks.Notification | Where-Object { $_.hooks.command -like '*play-sound-decision*' };" ^
  "  if (-not $notifExists) {" ^
  "    if (-not $json.hooks.Notification) { $json.hooks | Add-Member -NotePropertyName Notification -NotePropertyValue @() };" ^
  "    $json.hooks.Notification += @{ hooks = @(@{ type = 'command'; command = $notifCmd }) };" ^
  "    Write-Host '  OK Notification hook added to settings.json'" ^
  "  } else { Write-Host '  OK Notification hook already present - skipping' };" ^
  "  $json | ConvertTo-Json -Depth 10 | Set-Content $settings" ^
  "} else {" ^
  "  $json = [PSCustomObject]@{ hooks = [PSCustomObject]@{" ^
  "    Stop = @(@{ hooks = @(@{ type = 'command'; command = $stopCmd }) });" ^
  "    Notification = @(@{ hooks = @(@{ type = 'command'; command = $notifCmd }) })" ^
  "  } };" ^
  "  $json | ConvertTo-Json -Depth 10 | Set-Content $settings;" ^
  "  Write-Host '  OK Created settings.json'" ^
  "}"

echo.
echo All done! Restart Claude Code / Cowork to activate sound notifications.
echo To switch themes later, edit %CLAUDE_DIR%\sound-theme.txt
pause
