<#
.SYNOPSIS
  Verifies that the hosted Supabase database matches the repository migration.

.DESCRIPTION
  Runs supabase/tests/verify_hosted.sql against the project and checks every
  value against what the migration produces. Exits non-zero on any mismatch.

  The connection details are read from .env.local (which is git-ignored):
    DATABASE_URL  - transaction mode pooler
    DIRECT_URL    - session mode pooler, used here because migrations and
                    multi-statement scripts need advisory locks and prepared
                    statements.

.EXAMPLE
  npm run verify:db
#>
[CmdletBinding()]
param(
  [string] $ProjectRef = 'zgceowmjclcqonwumeyz',
  [string] $Region = 'ap-southeast-1'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot '.env.local'

if (-not (Test-Path $envFile)) {
  throw "No .env.local found. Create it with the pooler connection strings (see the README)."
}

# Read the connection strings from .env.local.
$values = @{}
foreach ($line in Get-Content $envFile) {
  if ($line -match '^\s*([A-Z_]+)\s*=\s*"?([^"#]+)"?\s*$') {
    $values[$Matches[1]] = $Matches[2].Trim()
  }
}

$directUrl = $values['DIRECT_URL']
if (-not $directUrl) {
  throw 'DIRECT_URL is missing from .env.local'
}

# The session-mode pooler is required: transaction mode cannot run the
# multi-statement scripts the CLI uses.
if ($directUrl -notmatch ':5432/') {
  $directUrl = $directUrl -replace ':6543/', ':5432/'
}

$env:SUPABASE_DB_PASSWORD = $values['SUPABASE_DB_PASSWORD']

Write-Host '==> Verifying the hosted database' -ForegroundColor Cyan
Write-Host "    project : $ProjectRef" -ForegroundColor DarkGray
Write-Host "    url     : $directUrl" -ForegroundColor DarkGray

$verifyFile = Join-Path $repoRoot 'supabase\tests\verify_hosted.sql'

# The CLI writes progress messages to stderr. Under ErrorActionPreference = Stop
# PowerShell would treat those as terminating errors, so stderr is captured
# separately and the preference is relaxed just for this call.
$stderrFile = [System.IO.Path]::GetTempFileName()
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$output = supabase db query --db-url $directUrl --file $verifyFile 2> $stderrFile | Out-String
$ErrorActionPreference = $previousPreference
$stderr = Get-Content $stderrFile -Raw -ErrorAction SilentlyContinue
Remove-Item $stderrFile -Force -ErrorAction SilentlyContinue

if ($output -notmatch '"rows"') {
  Write-Host $stderr -ForegroundColor Red
  Write-Host $output -ForegroundColor Red
  throw 'The verification query failed.'
}

# Parse the returned row into a map.
$row = [regex]::Match($output, '"rows":\s*\[\s*\{(?<body>[\s\S]*?)\}\s*\]')
if (-not $row.Success) {
  Write-Host $output -ForegroundColor Red
  throw 'Could not parse the verification result.'
}

$actual = @{}
foreach ($pair in [regex]::Matches($row.Groups['body'].Value, '"(?<key>[a-z_0-9]+)":\s*(?<value>\d+)')) {
  $actual[$pair.Groups['key'].Value] = [int] $pair.Groups['value'].Value
}

# expected value keyed by the column name
$expected = @{
  tables_expected_3             = 3
  game_functions_expected_6     = 6
  functions_without_search_path_expected_0 = 0
  policies_expected_3           = 3
  rls_enabled_expected_3        = 3
  realtime_published_expected_1 = 1
  grants_ok_expected_6          = 6
  payload_locked_expected_1     = 1
  migration_recorded_expected_1 = 1
}

$failed = $false
Write-Host ''
foreach ($key in ($expected.Keys | Sort-Object)) {
  $want = $expected[$key]
  $got = if ($actual.ContainsKey($key)) { $actual[$key] } else { -1 }
  $ok = $got -eq $want
  if (-not $ok) { $failed = $true }
  $label = $key -replace '_expected_\d+$', ''
  Write-Host ("    {0,-42} {1,4}  (expected {2})" -f $label, $got, $want) -ForegroundColor $(if ($ok) { 'Green' } else { 'Red' })
}

Write-Host ''
foreach ($key in @('rooms_remaining', 'players_remaining', 'moves_remaining')) {
  if ($actual.ContainsKey($key)) {
    Write-Host ("    {0,-42} {1,4}" -f $key, $actual[$key]) -ForegroundColor DarkGray
  }
}

Write-Host ''
if ($failed) {
  Write-Host 'VERIFICATION FAILED - the hosted database does not match the migration.' -ForegroundColor Red
  Write-Host "Re-apply it with:  supabase db push --db-url <session mode pooler url>" -ForegroundColor Red
  exit 1
}

Write-Host 'VERIFIED - the hosted database matches the repository migration.' -ForegroundColor Green
exit 0
