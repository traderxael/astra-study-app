# Arranca la app completa en Windows (sin Docker).
#
#   .\scripts\start-local.ps1
#
# Levanta: Postgres embebido (5432) -> stub de IA (4010) -> migraciones +
# seed -> Next.js (3000). Cada piece ya corriendo se saltea.
# Requisitos: `npm install` hecho (incluye @embedded-postgres/windows-x64).

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$pgBin = Join-Path $root "node_modules\@embedded-postgres\windows-x64\native\bin"
$pgData = Join-Path $root ".data\pgdata"
$env:Path = "$pgBin;$env:Path"

function Test-Port([int]$Port) {
  $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

# 1. Postgres
if (-not (Test-Port 5432)) {
  if (-not (Test-Path (Join-Path $pgData "PG_VERSION"))) {
    Write-Host "Inicializando Postgres en $pgData ..."
    New-Item -ItemType Directory -Force -Path $pgData | Out-Null
    $pwFile = Join-Path $env:TEMP "astra-pg-password.txt"
    Set-Content -Path $pwFile -Value "astra" -NoNewline
    & (Join-Path $pgBin "initdb.exe") -D $pgData -U astra -A scram-sha-256 `
      --pwfile="$pwFile" -E UTF8 --locale=C
    if ($LASTEXITCODE -ne 0) { throw "initdb falló" }
  }
  Write-Host "Arrancando Postgres ..."
  & (Join-Path $pgBin "pg_ctl.exe") -D $pgData -l (Join-Path $root ".data\pg.log") `
    -o "-p 5432 -h localhost" -w -t 60 start
  if (-not (Test-Port 5432)) { throw "Postgres no levantó en el puerto 5432" }
} else {
  Write-Host "Postgres ya estaba en 5432."
}

# 2. Stub de IA (para no gastar tokens en desarrollo)
if (-not (Test-Port 4010)) {
  Write-Host "Arrancando stub de IA en 4010 ..."
  Start-Process -FilePath "node" -ArgumentList "scripts\local-ai-stub.mjs" `
    -WorkingDirectory $root -WindowStyle Hidden
  Start-Sleep -Seconds 2
} else {
  Write-Host "El stub de IA ya estaba en 4010."
}

# 3. Esquema + admin
Write-Host "Aplicando migraciones ..."
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy falló" }

$env:DATABASE_URL = "postgresql://astra:astra@localhost:5432/astra_study?schema=public"
node scripts/seed-admin.mjs

# 4. App
if (-not (Test-Path (Join-Path $root ".next\BUILD_ID"))) {
  Write-Host "No hay build: compilando (puede tardar) ..."
  npm run build
}

Write-Host ""
Write-Host "App en http://localhost:3000  (login: estudio@local / test-pass)"
npm run start
