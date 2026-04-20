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

# Локальный FastAPI: $env:GORDO_USE_LOCAL_API='1'
# Удалённый API без хардкода в скрипте: $env:GORDO_PUBLIC_API_URL или $env:NEXT_PUBLIC_API_URL
if ($env:GORDO_USE_LOCAL_API -eq "1") {
    Set-Content -Path $frontendEnv -Value "NEXT_PUBLIC_API_URL=http://127.0.0.1:$backendPort`nNEXT_PUBLIC_API_FORCE_LOCAL=1" -Encoding utf8
} else {
    $publicApiUrl = $env:GORDO_PUBLIC_API_URL
    if (-not $publicApiUrl) { $publicApiUrl = $env:NEXT_PUBLIC_API_URL }
    if ($publicApiUrl) {
        Set-Content -Path $frontendEnv -Value "NEXT_PUBLIC_API_URL=$publicApiUrl" -Encoding utf8
    } else {
        Write-Host "[gordo] Не задан GORDO_PUBLIC_API_URL / NEXT_PUBLIC_API_URL — Next.js возьмёт NEXT_PUBLIC_API_URL из .env.development (если есть)."
    }
}

Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"Set-Location '$backendPath'; uvicorn app.main:app --reload --host 127.0.0.1 --port $backendPort`""
Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"Set-Location '$root'; npm run dev`""
