# graphyloop - detached dev-server launcher for Windows agent sessions.
#
# Starts a long-lived server WITHOUT holding the calling agent's stdout pipe
# open, polls it until it answers, prints PID/SERVER_UP and exits. Works from any
# project directory.
#
# Usage:
#   powershell -File "$HOME\.config\opencode\plugins\server-guard\start-server.ps1" `
#       -Port 4321 -Command '"C:\Program Files\nodejs\node.exe" "scripts\preview.mjs"'
#   powershell -File "...\start-server.ps1" -Port 4321 -Stop
#
# server-guard/plugin.js rewrites inline `npm run dev`-style commands into this
# launcher automatically, so agents normally never call it by hand.

param(
    [Parameter(Mandatory = $true)]
    [int]$Port,

    [string]$Command,

    # Base64(UTF8) of the full command line. Preferred for programmatic callers:
    # embedded double quotes do not survive the powershell.exe argv parser, so
    # paths with spaces get mangled in -Command. Base64 has no quoting at all.
    [string]$CommandB64,

    [string]$WorkingDirectory = $PWD.Path,

    [string]$HealthUrl = "http://127.0.0.1:$Port",

    [int]$HealthTimeout = 15,

    [string]$LogDir = (Join-Path $PWD.Path ".opencode\logs"),

    [switch]$Stop
)

# Split a full command string into executable + argument list at the first
# space that is outside quotes, so quoted exe paths (e.g. "C:\Program Files\...")
# survive intact. The powershell -File argument parser STRIPS embedded double
# quotes, so a fallback rebuilds space-containing paths by greedy
# longest-prefix matching against existing files.
function Split-CommandString {
    param([string]$CommandString)

    $CommandString = $CommandString.Trim()

    # 1. Quote-aware split at first space outside quotes.
    $inQuote = $false
    $splitAt = -1
    for ($i = 0; $i -lt $CommandString.Length; $i++) {
        $c = $CommandString[$i]
        if ($c -eq '"') { $inQuote = -not $inQuote }
        elseif ($c -eq ' ' -and -not $inQuote) { $splitAt = $i; break }
    }
    if ($splitAt -lt 0) { return @($CommandString.Trim('"'), '') }

    $exe = $CommandString.Substring(0, $splitAt).Trim('"')
    $rest = $CommandString.Substring($splitAt + 1).Trim()
    if (Test-Path -LiteralPath $exe -PathType Leaf) {
        return @($exe, $rest)
    }

    # 2. Quotes were stripped in transit and a path with spaces broke apart.
    #    Rebuild: exe = longest token prefix naming an existing file, then
    #    re-quote multi-token file paths in the remaining args the same way.
    $tokens = @(($CommandString.Replace('"', '') -split ' +') | Where-Object { $_ })
    $exeEnd = -1
    for ($n = $tokens.Count; $n -ge 1; $n--) {
        $candidate = $tokens[0..($n - 1)] -join ' '
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { $exeEnd = $n; break }
    }
    if ($exeEnd -lt 1) { return @($exe, $rest) }

    $exe = $tokens[0..($exeEnd - 1)] -join ' '
    $restTokens = @()
    if ($exeEnd -lt $tokens.Count) { $restTokens = @($tokens[$exeEnd..($tokens.Count - 1)]) }

    $outParts = @()
    $i = 0
    while ($i -lt $restTokens.Count) {
        $matched = $false
        for ($n = $restTokens.Count; $n -gt ($i + 1); $n--) {
            $candidate = $restTokens[$i..($n - 1)] -join ' '
            if (Test-Path -LiteralPath $candidate -PathType Leaf) {
                $outParts += ('"' + $candidate + '"')
                $i = $n
                $matched = $true
                break
            }
        }
        if (-not $matched) {
            $outParts += $restTokens[$i]
            $i++
        }
    }
    return @($exe, ($outParts -join ' '))
}

function Stop-PortListener {
    param([int]$ListenerPort)

    Get-NetTCPConnection -LocalPort $ListenerPort -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

# The launched process is a cmd.exe wrapper whose child is the real server, so
# killing the saved PID alone would orphan the server. /T takes the tree.
function Stop-ProcessTree {
    param([int]$TreePid)

    if ($TreePid -le 0) { return }
    & taskkill.exe /PID $TreePid /T /F 2>&1 | Out-Null
    Stop-Process -Id $TreePid -Force -ErrorAction SilentlyContinue
}

$pidFile = Join-Path $LogDir "server-$Port.pid"
$legacyPidFile = Join-Path $LogDir "server.pid"

if ($Stop) {
    # 1. Kill the saved PID tree(s) from a previous launch. Per-port file first,
    #    legacy single-file path second for launches from older versions.
    foreach ($file in @($pidFile, $legacyPidFile)) {
        if (-not (Test-Path $file)) { continue }
        Get-Content $file -ErrorAction SilentlyContinue |
            ForEach-Object { $_.Trim() } |
            Where-Object { $_ -match '^\d+$' } |
            ForEach-Object { Stop-ProcessTree -TreePid ([int]$_) }
    }

    # 2. Kill any existing listener on the port.
    Stop-PortListener -ListenerPort $Port

    # 3. Done.
    Write-Output "SERVER_STOPPED"
    exit 0
}

if ($CommandB64) {
    $Command = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($CommandB64))
}
if (-not $Command) {
    Write-Error "Provide -Command or -CommandB64"
    exit 1
}
Write-Output "COMMAND: $Command"

# 1. Kill any existing listener on $Port.
Stop-PortListener -ListenerPort $Port

# 2. Give the port a moment to fully release.
Start-Sleep -Milliseconds 500

# 3. Create $LogDir if missing.
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# 4. Launch with NO inherited handles - this is what keeps the caller alive.
#
#    Start-Process -RedirectStandardOutput/-RedirectStandardError LOOKS like the
#    safe detach pattern, but it makes PowerShell call CreateProcess with
#    bInheritHandles=TRUE, which duplicates every inheritable handle of this
#    process into the child - including the stdout/stderr PIPE that the calling
#    agent's shell tool handed to powershell.exe. The dev server then holds that
#    pipe open for its entire life, the tool call never sees EOF, and the session
#    hangs forever even though this script already exited. Measured with a
#    self-exiting fixture server: launcher exited at 2.3s, caller's stdout EOF
#    only arrived at 21.8s - the moment the child died.
#
#    Fix: move the file redirection into a generated .cmd wrapper and start it
#    with NO -Redirect* parameter, so PowerShell goes through ShellExecuteEx,
#    which creates the process with bInheritHandles=FALSE. Nothing of ours leaks,
#    and stdout/stderr still land in the log files.
#
#    NOTE: never name the argument variable $args - it is a PowerShell automatic
#    variable and assignments to it are silently ignored, which made ArgumentList
#    empty for every multi-part command.
$parts = Split-CommandString -CommandString $Command
$exe = $parts[0]
$exeArgs = $parts[1]

if (-not $exe) {
    Write-Error "Invalid -Command: no executable found in '$Command'"
    exit 1
}

$outLog = Join-Path $LogDir "out.log"
$errLog = Join-Path $LogDir "err.log"
$wrapper = Join-Path $LogDir "server-$Port.cmd"

$commandLine = if ($exeArgs) { '"{0}" {1}' -f $exe, $exeArgs } else { '"{0}"' -f $exe }
# OEM encoding, no BOM: a UTF-8 BOM makes cmd.exe choke on the first line.
@(
    '@echo off',
    ('cd /d "{0}"' -f $WorkingDirectory),
    ('{0} > "{1}" 2> "{2}"' -f $commandLine, $outLog, $errLog)
) | Out-File -FilePath $wrapper -Encoding oem -Force

$proc = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', ('"{0}"' -f $wrapper) `
    -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru

# 5. Write PID(s) to $LogDir for later stopping. The wrapper PID is written
#    immediately; the real server PID is appended once the port is listening.
$wrapperPid = if ($proc) { $proc.Id } else { 0 }
if ($wrapperPid -gt 0) {
    $wrapperPid | Out-File -FilePath $pidFile -Encoding ascii
    $wrapperPid | Out-File -FilePath $legacyPidFile -Encoding ascii
}

# 6. Print PID.
Write-Output "PID: $wrapperPid"

# 7. Poll $HealthUrl every 1 second up to $HealthTimeout seconds.
$deadline = (Get-Date).AddSeconds($HealthTimeout)
$serverUp = $false

while ((Get-Date) -lt $deadline) {
    try {
        $response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            $serverUp = $true
            break
        }
    }
    catch {
        # Not up yet - keep polling.
    }
    Start-Sleep -Seconds 1
}

# 8. Verdict.
if ($serverUp) {
    $listenerPid = (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1).OwningProcess
    if ($listenerPid) {
        Write-Output "LISTENER_PID: $listenerPid"
        if ($listenerPid -ne $wrapperPid) {
            Add-Content -Path $pidFile -Value $listenerPid
            Add-Content -Path $legacyPidFile -Value $listenerPid
        }
    }
    Write-Output "SERVER_UP"
}
else {
    Write-Output "SERVER_DOWN"
    if (Test-Path $errLog) {
        Get-Content $errLog -Tail 10
    }
}

# 9. Exit explicitly so powershell.exe tears down its stdio right away instead
#    of lingering in finalizers while the caller waits on EOF.
exit 0
