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

# Локальный API по умолчанию. Удалённый: задайте только явно GORDO_PUBLIC_API_URL= (не используем NEXT_PUBLIC_API_URL из среды пользователя — иначе подставлялся Railway).
if ($env:GORDO_PUBLIC_API_URL) {
    $gordo = $env:GORDO_PUBLIC_API_URL
    # Ошибочная вставка целиком «NEXT_PUBLIC_API_URL=https://…» в значение переменной
    if ($gordo -like "*NEXT_PUBLIC_API_URL=*") {
        $key = "NEXT_PUBLIC_API_URL="
        $idx = $gordo.LastIndexOf($key)
        if ($idx -ge 0) { $gordo = $gordo.Substring($idx + $key.Length) }
    }
    Set-Content -Path $frontendEnv -Value "NEXT_PUBLIC_API_URL=$gordo" -Encoding utf8
} else {
    Set-Content -Path $frontendEnv -Value "NEXT_PUBLIC_API_URL=http://127.0.0.1:$backendPort" -Encoding utf8
}

Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"Set-Location '$backendPath'; uvicorn app.main:app --reload --host 127.0.0.1 --port $backendPort`""
Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"Set-Location '$root'; npm run dev`""
