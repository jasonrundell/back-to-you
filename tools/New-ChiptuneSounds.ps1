# Generates the chiptune sound pack as 8-bit mono WAV files.
#
# Every sound here is synthesized from the note manifest at the bottom of this
# file - there are no audio assets. Edit a melody, re-run, and the pack changes.
#
#   .\New-ChiptuneSounds.ps1 -OutputRoot ..\sounds\chiptune
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $OutputRoot,

    [int] $SampleRate = 22050
)

$ErrorActionPreference = 'Stop'

# --- synth -----------------------------------------------------------------

$script:NoteOffsets = @{ C = 0; D = 2; E = 4; F = 5; G = 7; A = 9; B = 11 }

function ConvertTo-Frequency {
    # 'C5', 'Eb4', 'F#5' -> Hz, 12-tone equal temperament against A4 = 440.
    param([string] $Note)

    if ($Note -notmatch '^([A-G])([#b]?)(-?\d)$') {
        throw "Unparseable note: '$Note'"
    }
    $semitone = $script:NoteOffsets[$Matches[1]]
    if ($Matches[2] -eq '#') { $semitone++ }
    elseif ($Matches[2] -eq 'b') { $semitone-- }

    $midi = (([int]$Matches[3] + 1) * 12) + $semitone
    return 440.0 * [math]::Pow(2, ($midi - 69) / 12.0)
}

function New-Tone {
    # One step of a melody. Returns 8-bit unsigned PCM samples.
    #
    # Freq/ToFreq  - hold a pitch, or glide between two (ToFreq drives sweeps)
    # Duty         - square wave pulse width; 0.5 is hollow, 0.125 is nasal/buzzy
    # Vol          - 0..1 peak amplitude
    # Decay        - $true fades to silence (avoids clicks), $false holds flat
    param(
        [double] $Freq,
        [double] $ToFreq = 0,
        [int]    $Ms,
        [double] $Duty = 0.5,
        [double] $Vol = 0.35,
        [bool]   $Decay = $true
    )

    $count = [int]($SampleRate * $Ms / 1000)
    $buf = New-Object byte[] $count
    if ($count -eq 0) { return ,$buf }

    if ($ToFreq -le 0) { $ToFreq = $Freq }

    # A phase accumulator keeps sweeps continuous; computing phase as
    # i * freq / rate would jump discontinuously as freq changes.
    $phase = 0.0
    for ($i = 0; $i -lt $count; $i++) {
        $t = $i / [double]$count

        if ($Freq -gt 0) {
            $f = $Freq + (($ToFreq - $Freq) * $t)
            $phase = ($phase + ($f / $SampleRate)) % 1.0
            $wave = if ($phase -lt $Duty) { 1.0 } else { -1.0 }
        } else {
            $wave = 0.0   # rest
        }

        $envelope = if ($Decay) { 1.0 - $t } else { 1.0 }

        # 8-bit unsigned PCM: silence sits at 128, not 0.
        $sample = 128 + ($wave * $envelope * $Vol * 127)
        $buf[$i] = [byte][math]::Max(0, [math]::Min(255, [math]::Round($sample)))
    }
    return ,$buf
}

function Write-Wav {
    param([string] $Path, [byte[]] $Samples)

    $fs = [System.IO.File]::Create($Path)
    try {
        $bw = New-Object System.IO.BinaryWriter($fs)
        $bw.Write([char[]]'RIFF')
        $bw.Write([int](36 + $Samples.Length))
        $bw.Write([char[]]'WAVE')
        $bw.Write([char[]]'fmt ')
        $bw.Write([int]16)              # fmt chunk size
        $bw.Write([int16]1)             # PCM
        $bw.Write([int16]1)             # mono
        $bw.Write([int]$SampleRate)
        $bw.Write([int]$SampleRate)     # byte rate = rate * channels * bytes/sample
        $bw.Write([int16]1)             # block align
        $bw.Write([int16]8)             # bits per sample
        $bw.Write([char[]]'data')
        $bw.Write([int]$Samples.Length)
        $bw.Write($Samples)
        $bw.Flush()
    } finally {
        $fs.Close()
    }
}

function Build-Sound {
    param([array] $Steps)

    $all = New-Object 'System.Collections.Generic.List[byte]'
    foreach ($s in $Steps) {
        $freq = if ($s.Note) { ConvertTo-Frequency $s.Note } else { 0 }
        $to = if ($s.To) { ConvertTo-Frequency $s.To } else { 0 }

        $args = @{
            Freq = $freq
            ToFreq = $to
            Ms = $s.Ms
            Duty = if ($s.ContainsKey('Duty')) { $s.Duty } else { 0.5 }
            Vol = if ($s.ContainsKey('Vol')) { $s.Vol } else { 0.35 }
            Decay = if ($s.ContainsKey('Decay')) { $s.Decay } else { $true }
        }
        $all.AddRange((New-Tone @args))
    }
    return ,([byte[]]$all.ToArray())
}

# --- manifest --------------------------------------------------------------
#
# Shape carries the meaning. Rising and resolving to the tonic reads as "done";
# stopping on an unresolved interval reads as a question; falling by a minor
# second with a nasal duty cycle reads as "something broke".

$Pack = [ordered]@{

    'task-complete' = [ordered]@{
        'chip-arpeggio-up' = @(
            @{ Note = 'C5'; Ms = 70 }, @{ Note = 'E5'; Ms = 70 }
            @{ Note = 'G5'; Ms = 70 }, @{ Note = 'C6'; Ms = 220 }
        )
        'chip-fanfare' = @(
            @{ Note = 'G4'; Ms = 90; Duty = 0.25 }, @{ Note = 'C5'; Ms = 90; Duty = 0.25 }
            @{ Note = 'E5'; Ms = 60; Duty = 0.25 }, @{ Note = 'G5'; Ms = 280; Duty = 0.5 }
        )
        'chip-run-up' = @(
            @{ Note = 'C5'; Ms = 55 }, @{ Note = 'D5'; Ms = 55 }
            @{ Note = 'E5'; Ms = 55 }, @{ Note = 'G5'; Ms = 55 }
            @{ Note = 'C6'; Ms = 200 }
        )
        'chip-item-get' = @(
            @{ Note = 'E5'; Ms = 60 }, @{ Note = 'G5'; Ms = 60 }
            @{ Note = 'B5'; Ms = 60 }, @{ Note = 'E6'; Ms = 90 }
            @{ Note = 'B5'; Ms = 60 }, @{ Note = 'E6'; Ms = 300 }
        )
        'chip-two-note-done' = @(
            @{ Note = 'C5'; Ms = 100; Duty = 0.5 }
            @{ Note = 'G5'; Ms = 260; Duty = 0.25 }
        )
    }

    'decision-needed' = [ordered]@{
        # These deliberately end high and unresolved - the melodic "?".
        'chip-query' = @(
            @{ Note = 'C5'; Ms = 90 }, @{ Note = 'G5'; Ms = 200; Decay = $false }
            @{ Note = 'G5'; Ms = 60 }
        )
        'chip-ping-up' = @(
            @{ Note = 'E5'; Ms = 70 }, @{ Note = ''; Ms = 40 }
            @{ Note = 'B5'; Ms = 240 }
        )
        'chip-nudge' = @(
            @{ Note = 'A4'; Ms = 60; Duty = 0.25 }, @{ Note = 'C5'; Ms = 60; Duty = 0.25 }
            @{ Note = ''; Ms = 50 }
            @{ Note = 'A4'; Ms = 60; Duty = 0.25 }, @{ Note = 'C5'; Ms = 200; Duty = 0.25 }
        )
        'chip-waiting' = @(
            @{ Note = 'D5'; Ms = 80 }, @{ Note = 'F#5'; Ms = 80 }
            @{ Note = 'A5'; Ms = 240; Decay = $false }
            @{ Note = 'A5'; Ms = 80 }
        )
    }

    'error' = [ordered]@{
        'chip-fail' = @(
            @{ Note = 'E4'; Ms = 120; Duty = 0.125; Vol = 0.4 }
            @{ Note = 'Eb4'; Ms = 320; Duty = 0.125; Vol = 0.4 }
        )
        'chip-buzz-down' = @(
            @{ Note = 'C4'; To = 'G3'; Ms = 350; Duty = 0.125; Vol = 0.4 }
        )
        'chip-reject' = @(
            @{ Note = 'G3'; Ms = 90; Duty = 0.125; Vol = 0.4 }
            @{ Note = ''; Ms = 45 }
            @{ Note = 'G3'; Ms = 220; Duty = 0.125; Vol = 0.4 }
        )
    }

    'subagent-done' = [ordered]@{
        # Background events: quiet and short so they never startle.
        'chip-tick' = @(
            @{ Note = 'C7'; Ms = 40; Vol = 0.15 }
        )
        'chip-tick-double' = @(
            @{ Note = 'G6'; Ms = 35; Vol = 0.15 }, @{ Note = ''; Ms = 30 }
            @{ Note = 'C7'; Ms = 50; Vol = 0.15 }
        )
    }

    'session-start' = [ordered]@{
        'chip-powerup' = @(
            @{ Note = 'A3'; To = 'A5'; Ms = 400; Duty = 0.25; Vol = 0.3; Decay = $false }
            @{ Note = 'A5'; Ms = 120; Duty = 0.25; Vol = 0.3 }
        )
        'chip-boot' = @(
            @{ Note = 'C4'; Ms = 70; Vol = 0.3 }, @{ Note = 'G4'; Ms = 70; Vol = 0.3 }
            @{ Note = 'C5'; To = 'E5'; Ms = 260; Vol = 0.3 }
        )
    }
}

# --- generate --------------------------------------------------------------

$total = 0
foreach ($category in $Pack.Keys) {
    $dir = Join-Path $OutputRoot $category
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    foreach ($name in $Pack[$category].Keys) {
        $samples = Build-Sound -Steps $Pack[$category][$name]
        $path = Join-Path $dir "$name.wav"
        Write-Wav -Path $path -Samples $samples

        $ms = [int]($samples.Length * 1000 / $SampleRate)
        Write-Host ("  OK {0,-16} {1,-22} {2,4} ms" -f $category, $name, $ms)
        $total++
    }
}

Write-Host ""
Write-Host "Generated $total chiptune sounds into $OutputRoot"
