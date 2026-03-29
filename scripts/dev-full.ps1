$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

function Step([string]$message) {
	Write-Host "`n==> $message" -ForegroundColor Cyan
}

function Ensure-EnvFile([string]$targetPath, [string]$examplePath) {
	if (-not (Test-Path $targetPath)) {
		Copy-Item $examplePath $targetPath
		Write-Host "Created $targetPath from $examplePath" -ForegroundColor Yellow
	}
}

function Invoke-Required([string]$label, [scriptblock]$command) {
	& $command
	if ($LASTEXITCODE -ne 0) {
		throw "$label failed with exit code $LASTEXITCODE"
	}
}

function Invoke-BestEffort([string]$label, [scriptblock]$command) {
	& $command
	if ($LASTEXITCODE -ne 0) {
		Write-Host "Warning: $label failed (exit code $LASTEXITCODE). Continuing." -ForegroundColor Yellow
	}
}

Step "Ensuring package manager and workspace dependencies"
Invoke-BestEffort "corepack enable" { corepack enable | Out-Null }
Invoke-Required "pnpm install" { pnpm install }

Step "Ensuring required .env files exist"
Ensure-EnvFile ".env" ".env.example"
Ensure-EnvFile "server/.env" "server/.env.example"
Ensure-EnvFile "frontend/.env" "frontend/.env.example"

Step "Starting infrastructure containers (Postgres, Redis)"
Invoke-Required "Starting Redis container" { docker compose --profile infra up -d redis }

$previousErrorAction = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$postgresOutput = docker compose --profile infra up -d postgres 2>&1 | Out-String
$ErrorActionPreference = $previousErrorAction
if ($LASTEXITCODE -ne 0) {
	if ($postgresOutput -match "port is already allocated") {
		Write-Host "Warning: Port 5432 is already in use. Skipping postgres container start and continuing." -ForegroundColor Yellow
	} else {
		Write-Host $postgresOutput
		Write-Host "Warning: Postgres container failed to start. Continuing in case you already have a local Postgres instance." -ForegroundColor Yellow
	}
}

Step "Ensuring Docker Model Runner is ready"
$runnerStatus = docker model status 2>$null | Out-String
if ($LASTEXITCODE -ne 0 -or -not ($runnerStatus -match "running")) {
	Invoke-Required "docker model start-runner" { docker model start-runner }
}

$availableModels = docker model list | Out-String
if (-not ($availableModels -match "smollm2")) {
	Invoke-Required "docker model pull ai/smollm2" { docker model pull ai/smollm2 }
}

$runningModels = docker model ps | Out-String
if (-not ($runningModels -match "smollm2")) {
	Invoke-Required "docker model run -d ai/smollm2" { docker model run -d ai/smollm2 | Out-Null }
}

Invoke-Required "docker model ps" { docker model ps }

Step "Preparing Prisma client and schema"
Invoke-BestEffort "prisma generate" { pnpm --filter server run prisma:generate }
Invoke-BestEffort "prisma db push" { pnpm --filter server run prisma:push }

Step "Starting API, worker, and frontend with unified logs"
Write-Host "Press Ctrl+C to stop all services." -ForegroundColor Green
Invoke-Required "Starting dev services" { pnpm exec concurrently -k --names "api,worker,frontend" --prefix "[{name}]" --prefix-colors "cyan,magenta,green" "pnpm --filter server dev" "pnpm --filter server workers" "pnpm --filter frontend dev" }
