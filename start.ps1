$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $root "backend"
$frontendEnv = Join-Path $root ".env.local"

Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}

$backendPort = 8000
Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Milliseconds 300
if (Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue) {
    $backendPort = 8001
    Get-NetTCPConnection -LocalPort 8001 -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

Set-Content -Path $frontendEnv -Value "NEXT_PUBLIC_API_URL=http://localhost:$backendPort" -Encoding utf8

Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"Set-Location '$backendPath'; uvicorn main:app --reload --host 127.0.0.1 --port $backendPort`""
Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"Set-Location '$root'; npm run dev`""
