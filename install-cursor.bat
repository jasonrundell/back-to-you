@echo off
:: StarCraft Sound Notifications — Cursor Hook Installer (Windows)
setlocal

set SCRIPT_DIR=%~dp0
set CURSOR_DIR=%USERPROFILE%\.cursor

echo Installing StarCraft sound notifications for Cursor (Windows)...

dir /b "%SCRIPT_DIR%sounds\task-complete\*.mp3" >nul 2>nul
if errorlevel 1 (
  echo ERROR: Missing task-complete MP3 files in "%SCRIPT_DIR%sounds\task-complete"
  exit /b 1
)

dir /b "%SCRIPT_DIR%sounds\decision-needed\*.mp3" >nul 2>nul
if errorlevel 1 (
  echo ERROR: Missing decision-needed MP3 files in "%SCRIPT_DIR%sounds\decision-needed"
  exit /b 1
)

:: Create directories
if not exist "%CURSOR_DIR%\sounds\task-complete" mkdir "%CURSOR_DIR%\sounds\task-complete"
if not exist "%CURSOR_DIR%\sounds\decision-needed" mkdir "%CURSOR_DIR%\sounds\decision-needed"
if not exist "%CURSOR_DIR%\hooks" mkdir "%CURSOR_DIR%\hooks"

:: Copy sounds
xcopy /Y "%SCRIPT_DIR%sounds\task-complete\*.mp3" "%CURSOR_DIR%\sounds\task-complete\" >nul
echo   OK Task-complete sounds copied

xcopy /Y "%SCRIPT_DIR%sounds\decision-needed\*.mp3" "%CURSOR_DIR%\sounds\decision-needed\" >nul
echo   OK Decision-needed sounds copied

:: Copy Cursor user hook scripts
copy /Y "%SCRIPT_DIR%hooks\play-cursor-stop.ps1" "%CURSOR_DIR%\hooks\play-cursor-stop.ps1" >nul
echo   OK Cursor stop hook script installed

copy /Y "%SCRIPT_DIR%hooks\play-cursor-response.ps1" "%CURSOR_DIR%\hooks\play-cursor-response.ps1" >nul
echo   OK Cursor response hook script installed

:: Write or merge Cursor user hooks.json using PowerShell
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$hooksFile = '%CURSOR_DIR%\hooks.json';" ^
  "$stopCmd = 'powershell -NoProfile -ExecutionPolicy Bypass -File \".\\hooks\\play-cursor-stop.ps1\"';" ^
  "$responseCmd = 'powershell -NoProfile -ExecutionPolicy Bypass -File \".\\hooks\\play-cursor-response.ps1\"';" ^
  "if (Test-Path $hooksFile) {" ^
  "  $json = Get-Content $hooksFile -Raw | ConvertFrom-Json;" ^
  "  if (-not $json.version) { $json | Add-Member -NotePropertyName version -NotePropertyValue 1 };" ^
  "  if (-not $json.hooks) { $json | Add-Member -NotePropertyName hooks -NotePropertyValue ([PSCustomObject]@{}) };" ^
  "} else {" ^
  "  $json = [PSCustomObject]@{ version = 1; hooks = [PSCustomObject]@{} };" ^
  "}" ^
  "$stopExists = $json.hooks.stop | Where-Object { $_.command -like '*play-cursor-stop.ps1*' };" ^
  "if (-not $stopExists) {" ^
  "  if (-not $json.hooks.stop) { $json.hooks | Add-Member -NotePropertyName stop -NotePropertyValue @() };" ^
  "  $json.hooks.stop += @{ command = $stopCmd; timeout = 10 };" ^
  "  Write-Host '  OK Cursor stop hook added to hooks.json'" ^
  "} else { Write-Host '  OK Cursor stop hook already present - skipping' };" ^
  "$responseExists = $json.hooks.afterAgentResponse | Where-Object { $_.command -like '*play-cursor-response.ps1*' };" ^
  "if (-not $responseExists) {" ^
  "  if (-not $json.hooks.afterAgentResponse) { $json.hooks | Add-Member -NotePropertyName afterAgentResponse -NotePropertyValue @() };" ^
  "  $json.hooks.afterAgentResponse += @{ command = $responseCmd; timeout = 10 };" ^
  "  Write-Host '  OK Cursor afterAgentResponse hook added to hooks.json'" ^
  "} else { Write-Host '  OK Cursor afterAgentResponse hook already present - skipping' };" ^
  "$json | ConvertTo-Json -Depth 10 | Set-Content $hooksFile"

echo.
echo Cursor setup complete! Restart Cursor to activate sound notifications.
if /I not "%~1"=="nopause" pause
