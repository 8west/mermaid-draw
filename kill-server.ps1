param([int]$Port = 5173)

$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $conns) {
    Write-Host "Nothing listening on port $Port."
    exit 0
}

$conns | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
    $proc = Get-Process -Id $_ -ErrorAction SilentlyContinue
    Write-Host "Stopping $($proc.ProcessName) (PID $_) on port $Port"
    Stop-Process -Id $_ -Force
}
