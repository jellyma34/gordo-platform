# Portable PostgreSQL 17 for local GORDO dev (no Windows service / admin).
# Prerequisite: tools/pgsql/postgresql-17.10-1-windows-x64-binaries.zip downloaded.
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$PgRoot = Join-Path $Root "tools\pgsql"
$Zip = Join-Path $PgRoot "postgresql-17.10-1-windows-x64-binaries.zip"
$BinRoot = Join-Path $PgRoot "pgsql"
$DataDir = Join-Path $PgRoot "data"
$LogFile = Join-Path $PgRoot "postgres.log"
$ExpectedSize = 333925750

if (-not (Test-Path $Zip)) {
  Write-Error "Missing $Zip — download from https://get.enterprisedb.com/postgresql/postgresql-17.10-1-windows-x64-binaries.zip"
}
$size = (Get-Item $Zip).Length
if ($size -lt $ExpectedSize) {
  Write-Error "Zip incomplete ($size / $ExpectedSize bytes). Wait for download to finish."
}

if (-not (Test-Path (Join-Path $BinRoot "bin\psql.exe"))) {
  Write-Host "Extracting PostgreSQL binaries..."
  Expand-Archive -Path $Zip -DestinationPath $PgRoot -Force
}

$psql = Join-Path $BinRoot "bin\psql.exe"
$initdb = Join-Path $BinRoot "bin\initdb.exe"
$pgCtl = Join-Path $BinRoot "bin\pg_ctl.exe"
$createdb = Join-Path $BinRoot "bin\createdb.exe"

if (-not (Test-Path $DataDir)) {
  Write-Host "Initializing cluster in $DataDir"
  & $initdb -D $DataDir -U postgres -A trust -E UTF8
}

$running = Test-NetConnection 127.0.0.1 -Port 5432 -WarningAction SilentlyContinue | Select-Object -ExpandProperty TcpTestSucceeded
if (-not $running) {
  Write-Host "Starting PostgreSQL on :5432"
  & $pgCtl -D $DataDir -l $LogFile -o "-p 5432" start
  Start-Sleep 3
}

$env:PGPASSWORD = "postgres"
$dbExists = & $psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='gordo'" 2>$null
if ($dbExists -ne "1") {
  Write-Host "Creating database gordo"
  & $createdb -h 127.0.0.1 -p 5432 -U postgres gordo
}

Write-Host "PostgreSQL OK: 127.0.0.1:5432, database gordo"
& $psql -h 127.0.0.1 -p 5432 -U postgres -d gordo -c "SELECT version();"
