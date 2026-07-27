@echo off
:: StarCraft / chiptune sound notifications - Claude Code / Cowork installer (Windows)
:: Keep this file ASCII-only with CRLF line endings; cmd mis-parses "::" comments
:: that contain non-ASCII characters when the file uses LF endings.
::
::   install.bat            installs both packs, activates starcraft
::   install.bat chiptune   installs both packs, activates chiptune
setlocal

set SCRIPT_DIR=%~dp0
set CLAUDE_DIR=%USERPROFILE%\.claude

set THEME=%~1
if "%THEME%"=="" set THEME=starcraft
if /I "%THEME%"=="starcraft" goto themeok
if /I "%THEME%"=="chiptune" goto themeok
echo ERROR: Unknown theme "%THEME%". Use "starcraft" or "chiptune".
pause
exit /b 1
:themeok

echo Installing sound notifications for Claude Code / Cowork (Windows)...
echo   Active theme: %THEME%
echo.

dir /b "%SCRIPT_DIR%sounds\starcraft\task-complete\*.mp3" >nul 2>nul
if errorlevel 1 (
  echo ERROR: Missing task-complete MP3 files in "%SCRIPT_DIR%sounds\starcraft\task-complete"
  pause
  exit /b 1
)

dir /b "%SCRIPT_DIR%sounds\starcraft\decision-needed\*.mp3" >nul 2>nul
if errorlevel 1 (
  echo ERROR: Missing decision-needed MP3 files in "%SCRIPT_DIR%sounds\starcraft\decision-needed"
  pause
  exit /b 1
)

dir /b "%SCRIPT_DIR%sounds\chiptune\task-complete\*.wav" >nul 2>nul
if errorlevel 1 (
  echo ERROR: Missing chiptune WAV files in "%SCRIPT_DIR%sounds\chiptune\task-complete"
  echo Regenerate them with: powershell -File tools\New-ChiptuneSounds.ps1 -OutputRoot sounds\chiptune
  pause
  exit /b 1
)

:: Create directories
if not exist "%CLAUDE_DIR%\sounds\starcraft\task-complete" mkdir "%CLAUDE_DIR%\sounds\starcraft\task-complete"
if not exist "%CLAUDE_DIR%\sounds\starcraft\decision-needed" mkdir "%CLAUDE_DIR%\sounds\starcraft\decision-needed"
if not exist "%CLAUDE_DIR%\hooks" mkdir "%CLAUDE_DIR%\hooks"

:: Install the StarCraft pack
xcopy /Y "%SCRIPT_DIR%sounds\starcraft\task-complete\*.mp3" "%CLAUDE_DIR%\sounds\starcraft\task-complete\" >nul
echo   OK StarCraft task-complete sounds copied

xcopy /Y "%SCRIPT_DIR%sounds\starcraft\decision-needed\*.mp3" "%CLAUDE_DIR%\sounds\starcraft\decision-needed\" >nul
echo   OK StarCraft decision-needed sounds copied

:: Install the chiptune pack
for %%C in (task-complete decision-needed error subagent-done session-start) do (
  if not exist "%CLAUDE_DIR%\sounds\chiptune\%%C" mkdir "%CLAUDE_DIR%\sounds\chiptune\%%C"
  xcopy /Y "%SCRIPT_DIR%sounds\chiptune\%%C\*.wav" "%CLAUDE_DIR%\sounds\chiptune\%%C\" >nul
)
echo   OK Chiptune sounds copied

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
