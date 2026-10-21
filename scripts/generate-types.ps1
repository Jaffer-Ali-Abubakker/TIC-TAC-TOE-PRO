<#
.SYNOPSIS
  Regenerates src/online/database.types.ts from the live database.

.DESCRIPTION
  The generated file is the single source of truth for the table row shapes
  and the RPC argument signatures. Regenerate it after any change to
  supabase/migrations/ and commit the result, so a schema change surfaces as
  a TypeScript error instead of a runtime surprise.

  Uses the session-mode pooler from .env.local.

.EXAMPLE
  npm run gen:types
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot '.env.local'
$outFile = Join-Path $repoRoot 'src\online\database.types.ts'

if (-not (Test-Path $envFile)) {
  throw 'No .env.local found. Create it with the pooler connection strings (see the README).'
}

$values = @{}
foreach ($line in Get-Content $envFile) {
  if ($line -match '^\s*([A-Z_]+)\s*=\s*"?([^"#]+)"?\s*$') {
    $values[$Matches[1]] = $Matches[2].Trim()
  }
}

$directUrl = $values['DIRECT_URL']
if (-not $directUrl) { throw 'DIRECT_URL is missing from .env.local' }
if ($directUrl -notmatch ':5432/') { $directUrl = $directUrl -replace ':6543/', ':5432/' }

$env:SUPABASE_DB_PASSWORD = $values['SUPABASE_DB_PASSWORD']

Write-Host '==> Generating types from the database' -ForegroundColor Cyan

$stderrFile = [System.IO.Path]::GetTempFileName()
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$output = supabase gen types typescript --db-url $directUrl --schema public 2> $stderrFile | Out-String
$ErrorActionPreference = $previousPreference
$stderr = Get-Content $stderrFile -Raw -ErrorAction SilentlyContinue
Remove-Item $stderrFile -Force -ErrorAction SilentlyContinue

if (-not $output.Contains('export type Database')) {
  Write-Host $stderr -ForegroundColor Red
  throw 'Type generation failed.'
}

Set-Content -LiteralPath $outFile -Value $output -Encoding utf8
Write-Host "    wrote $outFile ($((Get-Content $outFile | Measure-Object -Line).Lines) lines)" -ForegroundColor Green
Write-Host '    review the diff, then commit it together with the migration.' -ForegroundColor DarkGray
