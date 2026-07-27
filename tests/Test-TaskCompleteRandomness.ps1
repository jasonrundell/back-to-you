# Simulates the task-complete hook's random sound selection N times and prints
# a markdown distribution chart. Mirrors the exact selection logic used by
# hooks/play-sound.ps1 so the result reflects what Claude Code would actually
# pick at runtime (without playing audio).
[CmdletBinding()]
param(
    [string] $SoundDirectory = "$env:USERPROFILE\.claude\sounds\task-complete",
    [int]    $Iterations = 100,
    [int]    $BarWidth = 30
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $SoundDirectory)) {
    throw "Sound directory not found: $SoundDirectory"
}

$files = Get-ChildItem -LiteralPath $SoundDirectory -Filter *.mp3 -File
if (-not $files -or $files.Count -eq 0) {
    throw "No MP3 files found in $SoundDirectory"
}

if ($Iterations -lt 1) {
    throw "Iterations must be >= 1 (got $Iterations)"
}

$counts = [ordered]@{}
foreach ($f in $files) { $counts[$f.Name] = 0 }

for ($i = 0; $i -lt $Iterations; $i++) {
    # Same one-liner the hook uses: uniform random pick from the file list.
    $picked = ($files | Get-Random).Name
    $counts[$picked] = $counts[$picked] + 1
}

$totalFiles  = $files.Count
$maxCount    = ($counts.Values | Measure-Object -Maximum).Maximum
$expectedPct = [math]::Round(100 / $totalFiles, 2)
$ranked      = $counts.GetEnumerator() | Sort-Object Value -Descending

$lines = @()
$lines += ""
$lines += "## Task-complete random selection - $Iterations runs across $totalFiles files"
$lines += ""
$lines += "- Source directory: ``$SoundDirectory``"
$lines += "- Expected uniform share per file: $expectedPct%"
$lines += "- Max single-file count: $maxCount"
$lines += ""
$lines += "| File | Count | % | Distribution |"
$lines += "| --- | ---: | ---: | --- |"

foreach ($entry in $ranked) {
    $name  = $entry.Key
    $count = [int]$entry.Value
    $pct   = [math]::Round(($count / $Iterations) * 100, 1)
    $bars  = if ($maxCount -gt 0) { [int][math]::Round(($count / $maxCount) * $BarWidth) } else { 0 }
    $bar   = ('#' * $bars).PadRight($BarWidth, ' ')
    $lines += "| $name | $count | $pct% | ``$bar`` |"
}

$zeroCount = @($counts.Values | Where-Object { $_ -eq 0 }).Count
$lines += ""
$lines += "Files never selected: $zeroCount / $totalFiles"
$lines += ""

$lines -join "`n"
