# SCN Viewer v1.1.0 - Windows PowerShell 5.1, no external server dependency.
# Loopback-only HTTP server, small, bounded binary upload API for KitchenDraw bridge.
$ErrorActionPreference = 'Stop'
$viewer = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'viewer'))
$bridgeRoot = Join-Path $env:LOCALAPPDATA 'ScnViewerBridge'
$queue = Join-Path $bridgeRoot 'queue'
[IO.Directory]::CreateDirectory($queue) | Out-Null
$pidFile = Join-Path $bridgeRoot 'viewer-server.pid'
$port = 8765
$maxUpload = 50MB
$server = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)

function Reply($stream, [int]$status, [string]$mime, [byte[]]$body) {
    $reason = switch ($status) { 200 {'OK'} 202 {'Accepted'} 400 {'Bad Request'} 403 {'Forbidden'} 404 {'Not Found'} 405 {'Method Not Allowed'} 413 {'Payload Too Large'} default {'Internal Server Error'} }
    $header = "HTTP/1.1 $status $reason`r`nContent-Type: $mime`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nX-Content-Type-Options: nosniff`r`nConnection: close`r`n`r`n"
    $h = [Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($h, 0, $h.Length)
    $stream.Write($body, 0, $body.Length)
    $stream.Flush()
}
function JsonBytes([string]$body) { return [Text.Encoding]::UTF8.GetBytes($body) }
function SafeError([string]$message) { return ($message | ConvertTo-Json -Compress) }
function ReadRequest($stream) {
    # StreamReader buffers bytes after headers, corrupting binary uploads. Read raw header bytes instead.
    $mem = New-Object IO.MemoryStream
    $last = @(-1,-1,-1,-1)
    while ($mem.Length -lt 16384) {
        $n = $stream.ReadByte()
        if ($n -lt 0) { throw 'Kapcsolat lezárult a fejlécek előtt.' }
        $mem.WriteByte([byte]$n)
        $last = @($last[1],$last[2],$last[3],$n)
        if ($last[0] -eq 13 -and $last[1] -eq 10 -and $last[2] -eq 13 -and $last[3] -eq 10) { break }
    }
    if ($mem.Length -ge 16384) { throw 'Túl hosszú HTTP fejléc.' }
    $headerText = [Text.Encoding]::ASCII.GetString($mem.ToArray())
    $lines = $headerText.Split([string[]]@("`r`n"), [StringSplitOptions]::None)
    $first = $lines[0].Split(' ')
    if ($first.Length -lt 3) { throw 'Hibás HTTP kérés.' }
    $headers = @{}
    foreach ($line in $lines[1..($lines.Length-1)]) {
        $i = $line.IndexOf(':')
        if ($i -gt 0) { $headers[$line.Substring(0,$i).Trim()] = $line.Substring($i+1).Trim() }
    }
    return @{ Method=$first[0]; Path=$first[1].Split('?')[0]; Headers=$headers }
}
function GetResult([string]$id) {
    $prefix = Join-Path $queue $id
    if ([IO.File]::Exists($prefix + '.error.txt')) {
        $errorText = [IO.File]::ReadAllText($prefix + '.error.txt', [Text.Encoding]::UTF8)
        return '{"state":"error","message":' + (SafeError $errorText) + '}'
    }
    if ([IO.File]::Exists($prefix + '.done') -and [IO.File]::Exists($prefix + '.obj')) { return '{"state":"done"}' }
    if ([IO.File]::Exists($prefix + '.working')) { return '{"state":"working"}' }
    if ([IO.File]::Exists($prefix + '.pending')) { return '{"state":"pending"}' }
    return '{"state":"not_found"}'
}
function Serve($client) {
    $client.ReceiveTimeout = 20000
    $client.SendTimeout = 20000
    $stream = $client.GetStream()
    try {
        $req = ReadRequest $stream
        $method = $req.Method; $uri = $req.Path; $headers = $req.Headers
        if ($headers['Host'] -notin @('127.0.0.1:8765','localhost:8765')) {
            Reply $stream 403 'text/plain; charset=utf-8' (JsonBytes 'Host tiltva.')
            return
        }
        if ($method -eq 'POST' -and $uri -eq '/api/scn') {
            if ($headers['Origin'] -ne 'http://127.0.0.1:8765' -or $headers['X-Scn-Viewer'] -ne '1' -or $headers['Content-Type'] -ne 'application/octet-stream') {
                Reply $stream 403 'application/json; charset=utf-8' (JsonBytes '{"error":"Tiltott kérés."}')
                return
            }
            $size = [long]0
            if (-not [long]::TryParse([string]$headers['Content-Length'], [ref]$size) -or $size -le 0) {
                Reply $stream 400 'application/json; charset=utf-8' (JsonBytes '{"error":"Hiányzó fájlméret."}')
                return
            }
            if ($size -gt $maxUpload) {
                Reply $stream 413 'application/json; charset=utf-8' (JsonBytes '{"error":"50 MB-nál nagyobb SCN nem támogatott."}')
                return
            }
            $id = [guid]::NewGuid().ToString('N')
            $base = Join-Path $queue $id
            $temp = $base + '.part'
            $inputFile = $base + '.scn'
            try {
                $output = [IO.File]::Open($temp, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
                try {
                    $buffer = New-Object byte[] 65536
                    $left = $size
                    while ($left -gt 0) {
                        $got = $stream.Read($buffer, 0, [int][Math]::Min($buffer.Length, $left))
                        if ($got -le 0) { throw 'Megszakadt az SCN fájl feltöltése.' }
                        $output.Write($buffer, 0, $got)
                        $left -= $got
                    }
                } finally { $output.Dispose() }
                [IO.File]::Move($temp, $inputFile)
                # Job is visible to KitchenDraw only when the input is complete.
                [IO.File]::WriteAllText($base + '.pending', 'ready', [Text.Encoding]::ASCII)
            } catch {
                if ([IO.File]::Exists($temp)) { [IO.File]::Delete($temp) }
                if ([IO.File]::Exists($inputFile)) { [IO.File]::Delete($inputFile) }
                throw
            }
            Reply $stream 202 'application/json; charset=utf-8' (JsonBytes ('{"id":"' + $id + '","state":"pending"}'))
            return
        }
        if ($method -ne 'GET') {
            Reply $stream 405 'text/plain; charset=utf-8' (JsonBytes 'Csak GET / POST támogatott.')
            return
        }
        if ($uri -eq '/api/health') {
            $heartbeat = Join-Path $bridgeRoot 'heartbeat'
            $bridgeOnline = [IO.File]::Exists($heartbeat) -and (([DateTime]::UtcNow - [IO.File]::GetLastWriteTimeUtc($heartbeat)).TotalSeconds -lt 6)
            $online = if ($bridgeOnline) {'true'} else {'false'}
            Reply $stream 200 'application/json; charset=utf-8' (JsonBytes ('{"server":true,"bridge":' + $online + '}'))
            return
        }
        if ($uri -match '^/api/jobs/([a-f0-9]{32})$') {
            $id = $Matches[1]
            Reply $stream 200 'application/json; charset=utf-8' (JsonBytes (GetResult $id))
            return
        }
        if ($uri -match '^/api/model/([a-f0-9]{32})$') {
            $id = $Matches[1]; $base = Join-Path $queue $id
            if ([IO.File]::Exists($base + '.done') -and [IO.File]::Exists($base + '.obj')) {
                Reply $stream 200 'text/plain; charset=utf-8' ([IO.File]::ReadAllBytes($base + '.obj'))
            } else {
                Reply $stream 404 'text/plain; charset=utf-8' (JsonBytes 'A modell még nem készült el.')
            }
            return
        }
        if ($uri -match '^/api/manifest/([a-f0-9]{32})$') {
            $id = $Matches[1]; $base = Join-Path $queue $id
            if ([IO.File]::Exists($base + '.done') -and [IO.File]::Exists($base + '.manifest.json')) {
                Reply $stream 200 'application/json; charset=utf-8' ([IO.File]::ReadAllBytes($base + '.manifest.json'))
            } else {
                Reply $stream 404 'application/json; charset=utf-8' (JsonBytes '{"error":"Nincs metaadat."}')
            }
            return
        }
        # Whitelisted static assets within viewer/. Never serve queue contents.
        $name = [Uri]::UnescapeDataString($uri.TrimStart('/'))
        if ([string]::IsNullOrWhiteSpace($name)) { $name = 'index.html' }
        $path = [IO.Path]::GetFullPath((Join-Path $viewer $name.Replace('/', [IO.Path]::DirectorySeparatorChar)))
        $ok = $path.StartsWith($viewer + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -and [IO.File]::Exists($path)
        if (-not $ok) { Reply $stream 404 'text/plain; charset=utf-8' (JsonBytes 'Not found'); return }
        $mime = switch ([IO.Path]::GetExtension($path).ToLowerInvariant()) {
            '.html' { 'text/html; charset=utf-8' }
            '.js' { 'text/javascript; charset=utf-8' }
            '.css' { 'text/css; charset=utf-8' }
            '.svg' { 'image/svg+xml' }
            '.png' { 'image/png' }
            default { 'application/octet-stream' }
        }
        Reply $stream 200 $mime ([IO.File]::ReadAllBytes($path))
    } catch {
        Write-Warning $_.Exception.Message
        try { Reply $stream 500 'text/plain; charset=utf-8' (JsonBytes 'Helyi kiszolgálóhiba.') } catch {}
    }
}
try {
    # Desktop shortcuts may be clicked repeatedly: reuse the running viewer.
    try {
        $existing = Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/health' -TimeoutSec 2 -ErrorAction Stop
        if ($existing.server -eq $true) {
            Start-Process 'http://127.0.0.1:8765/'
            return
        }
    } catch { }
    $server.Start()
    [IO.File]::WriteAllText($pidFile, [string]$PID)
    Write-Host 'SCN Viewer: http://127.0.0.1:8765' -ForegroundColor Cyan
    Write-Host 'KitchenDraw bovitmeny allapota a Viewerben lathato.' -ForegroundColor Gray
    Write-Host 'Megallitas: Ctrl+C' -ForegroundColor Gray
    Start-Process 'http://127.0.0.1:8765/'
    while ($true) {
        $client = $server.AcceptTcpClient()
        try { Serve $client } finally { $client.Close() }
    }
} catch {
    $message = 'Az SCN Viewer nem indult el. ' + $_.Exception.Message
    $logFile = Join-Path $bridgeRoot 'startup-error.log'
    try { [IO.File]::AppendAllText($logFile, ((Get-Date).ToString('s') + ' ' + $message + [Environment]::NewLine)) } catch { }
    try {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show($message, 'SCN Viewer - indítási hiba', 'OK', 'Error') | Out-Null
    } catch { Write-Warning $message }
} finally {
    try { $server.Stop() } catch { }
    try {
        if ([IO.File]::Exists($pidFile) -and [IO.File]::ReadAllText($pidFile).Trim() -eq [string]$PID) {
            [IO.File]::Delete($pidFile)
        }
    } catch { }
}
