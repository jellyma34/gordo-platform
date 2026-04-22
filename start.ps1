$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $root "backend"
$frontendEnv = Join-Path $root ".env.local"

Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}

$backendPort = if ($env:PORT) { [int]$env:PORT } else { 8000 }
Get-NetTCPConnection -LocalPort $backendPort -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Milliseconds 300
if (Get-NetTCPConnection -State Listen -LocalPort $backendPort -ErrorAction SilentlyContinue) {
    $backendPort = $backendPort + 1
    Get-NetTCPConnection -LocalPort $backendPort -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

# Фронт: по умолчанию локальный API. Удалённый Railway dev: $env:GORDO_USE_RAILWAY_DEV='1'
# или явно $env:GORDO_PUBLIC_API_URL='https://...'
if ($env:GORDO_USE_RAILWAY_DEV -eq "1") {
    $publicApiUrl = if ($env:GORDO_PUBLIC_API_URL) { $env:GORDO_PUBLIC_API_URL } else { "https://gordo-platform-dev.up.railway.app" }
    Set-Content -Path $frontendEnv -Value "NEXT_PUBLIC_API_URL=$publicApiUrl" -Encoding utf8
} elseif ($env:GORDO_PUBLIC_API_URL) {
    Set-Content -Path $frontendEnv -Value "NEXT_PUBLIC_API_URL=$($env:GORDO_PUBLIC_API_URL)" -Encoding utf8
} else {
    Set-Content -Path $frontendEnv -Value "NEXT_PUBLIC_API_URL=http://localhost:$backendPort" -Encoding utf8
}

Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"Set-Location '$backendPath'; uvicorn app.main:app --reload --host localhost --port $backendPort`""
Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"Set-Location '$root'; npm run dev`""
