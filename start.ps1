$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $root "backend"
$frontendEnv = Join-Path $root ".env.local"

Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}

$backendPort = if ($env:PORT) { [int]$env:PORT } else { 8080 }
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

# Фронт: по умолчанию dev API на Railway. Локальный API: $env:GORDO_USE_LOCAL_API='1'.
# Иной публичный API: $env:GORDO_PUBLIC_API_URL='https://...' перед запуском.
$publicApiUrl = if ($env:GORDO_PUBLIC_API_URL) { $env:GORDO_PUBLIC_API_URL } else { "https://gordo-platform-dev.up.railway.app" }
if ($env:GORDO_USE_LOCAL_API -eq "1") {
    Set-Content -Path $frontendEnv -Value "NEXT_PUBLIC_API_URL=http://127.0.0.1:$backendPort`nNEXT_PUBLIC_API_FORCE_LOCAL=1" -Encoding utf8
} else {
    Set-Content -Path $frontendEnv -Value "NEXT_PUBLIC_API_URL=$publicApiUrl" -Encoding utf8
}

Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"Set-Location '$backendPath'; uvicorn app.main:app --reload --host 127.0.0.1 --port $backendPort`""
Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"Set-Location '$root'; npm run dev`""
