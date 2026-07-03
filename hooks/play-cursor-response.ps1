# Cursor user hook: plays a decision-needed sound when the agent response ends with a question.
$ErrorActionPreference = "Stop"

function Get-TextValues {
    param([Parameter(ValueFromPipeline = $true)] $Value)

    process {
        if ($null -eq $Value) {
            return
        }

        if ($Value -is [string]) {
            $Value
            return
        }

        if ($Value -is [System.Collections.IEnumerable] -and $Value -isnot [string]) {
            foreach ($item in $Value) {
                Get-TextValues $item
            }
            return
        }

        if ($Value.PSObject -and $Value.PSObject.Properties) {
            foreach ($property in $Value.PSObject.Properties) {
                if ($property.Name -match 'message|response|content|text') {
                    Get-TextValues $property.Value
                }
            }
        }
    }
}

function Get-HookResponseText {
    param([string]$InputData)

    if ([string]::IsNullOrWhiteSpace($InputData)) {
        return ''
    }

    try {
        $payload = $InputData | ConvertFrom-Json
        return ((Get-TextValues $payload) -join "`n")
    } catch {
        $match = [regex]::Match($InputData, '"text"\s*:\s*"((?:[^"\\]|\\.)*)"')
        if ($match.Success) {
            return [regex]::Unescape($match.Groups[1].Value)
        }

        return ''
    }
}

function Play-RandomSound {
    param([Parameter(Mandatory = $true)][string] $Directory)

    Add-Type -AssemblyName PresentationCore
    $files = Get-ChildItem "$Directory\*.mp3" -ErrorAction SilentlyContinue
    if (-not $files) {
        throw "No MP3 files found in $Directory"
    }

    $file = ($files | Get-Random).FullName
    $player = New-Object System.Windows.Media.MediaPlayer
    $player.Open([uri]::new($file))
    $player.Play()
    Start-Sleep -Seconds 4
    $player.Stop()
    $player.Close()
}

$inputData = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($inputData)) {
    exit 0
}

$text = Get-HookResponseText -InputData $inputData

if ($text -match '\?[^a-zA-Z0-9]*$') {
    Play-RandomSound "$env:USERPROFILE\.cursor\sounds\decision-needed"
    Set-Content "$env:USERPROFILE\.cursor\last-decision-sound.txt" -Value ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
}
