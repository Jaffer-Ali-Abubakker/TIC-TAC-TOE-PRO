<#
.SYNOPSIS
  Enables anonymous sign-ins on a Supabase project.

.DESCRIPTION
  Tic-Tac-Toe Pro uses Supabase anonymous sign-in so that a casual player can
  play online without creating an account. If that provider is switched off,
  the app shows:

      "Anonymous sign-ins are disabled on this Supabase project."

  This script turns it on through the Supabase Management API.

  The personal access token is read with a hidden prompt and is only used in
  memory. It is never written to disk, never printed and never passed as a
  command line argument, so it never ends up in your shell history.

  The token needs the "read:organization" scope.

  Create one at: https://supabase.com/dashboard/account/tokens

.EXAMPLE
  pwsh -File scripts/enable-anonymous-signin.ps1

.EXAMPLE
  pwsh -File scripts/enable-anonymous-signin.ps1 -ProjectRef zgceowmjclcqonwumeyz
#>
[CmdletBinding()]
param(
  # Supabase project ref (the part of the project URL between https:// and
  # .supabase.co). Defaults to the value in your .env file.
  [string] $ProjectRef,

  # Publishable key, used for the public verification call.
  [string] $PublishableKey
)

$ErrorActionPreference = 'Stop'

$ManagementApi = 'https://api.supabase.com'

function Write-Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Ok($m) { Write-Host "    OK  $m" -ForegroundColor Green }
function Write-Bad($m) { Write-Host "    !!  $m" -ForegroundColor Yellow }

# ---------------------------------------------------------------------------
# 0. Read the project ref and key from .env when not supplied
# ---------------------------------------------------------------------------
$envPath = Join-Path (Split-Path -Parent $PSScriptRoot) '.env'
if (-not $ProjectRef -or -not $PublishableKey) {
  if (Test-Path $envPath) {
    foreach ($line in Get-Content $envPath) {
      if ($line -match '^\s*VITE_SUPABASE_URL\s*=\s*https://([a-z0-9]+)\.supabase\.co') {
        if (-not $ProjectRef) { $ProjectRef = $Matches[1] }
      }
      if ($line -match '^\s*VITE_SUPABASE_PUBLISHABLE_KEY\s*=\s*(\S+)') {
        if (-not $PublishableKey) { $PublishableKey = $Matches[1] }
      }
    }
  }
}

if (-not $ProjectRef) {
  throw 'No project ref. Pass -ProjectRef <ref> or add VITE_SUPABASE_URL to your .env file.'
}
Write-Ok "Project ref: $ProjectRef"

# ---------------------------------------------------------------------------
# 1. Current state (public endpoint, no token needed)
# ---------------------------------------------------------------------------
function Get-AnonymousSetting {
  param([string] $Key)
  if (-not $Key) { return $null }
  try {
    $s = Invoke-RestMethod -Uri "https://$ProjectRef.supabase.co/auth/v1/settings" -Headers @{ apikey = $Key } -Method Get -TimeoutSec 25
    return $s.external.anonymous_users
  } catch {
    return $null
  }
}

Write-Step 'Current state'
$current = Get-AnonymousSetting -Key $PublishableKey
if ($null -ne $current) {
  Write-Host "    anonymous_users = $current" -ForegroundColor DarkGray
  if ($current -eq $true) {
    Write-Ok 'Anonymous sign-ins are ALREADY enabled - nothing to do.'
    exit 0
  }
}

# ---------------------------------------------------------------------------
# 2. Personal access token
# ---------------------------------------------------------------------------
Write-Step 'Supabase personal access token'
Write-Host '    Create one at: https://supabase.com/dashboard/account/tokens' -ForegroundColor DarkGray
Write-Host '    (held in memory only - never written to disk)' -ForegroundColor DarkGray

$secure = Read-Host '    Paste your token (input hidden)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

if ([string]::IsNullOrWhiteSpace($token)) {
  throw 'No token entered. Aborting.'
}

$headers = @{
  Authorization  = "Bearer $token"
  'Content-Type' = 'application/json'
}

# ---------------------------------------------------------------------------
# 3. Enable it
# ---------------------------------------------------------------------------
Write-Step 'Enabling anonymous sign-ins'
try {
  $body = @{ external = @{ anonymous_users = $true } } | ConvertTo-Json -Depth 4
  Invoke-RestMethod -Uri "$ManagementApi/v1/projects/$ProjectRef/config/auth" -Headers $headers -Method Patch -Body $body -TimeoutSec 40 | Out-Null
} catch {
  $status = try { [int] $_.Exception.Response.StatusCode } catch { 0 }
  if ($status -eq 401 -or $status -eq 403) {
    throw 'The access token was rejected (401/403). Create a new personal access token with the "read:organization" scope.'
  }
  throw "Could not update the auth config: $($_.Exception.Message)"
}

# ---------------------------------------------------------------------------
# 4. Verify
# ---------------------------------------------------------------------------
Write-Step 'Verifying'
$verified = $null
for ($i = 0; $i -lt 8; $i++) {
  Start-Sleep -Seconds 2
  $verified = Get-AnonymousSetting -Key $PublishableKey
  if ($verified -eq $true) { break }
}

if ($verified -eq $true) {
  Write-Ok 'Anonymous sign-ins are now ENABLED.'
  Write-Host ''
  Write-Host 'Next:' -ForegroundColor Cyan
  Write-Host '  1. Open the app -> Online -> Create private room.'
  Write-Host '     (if the dev server is already running, no restart is needed)'
  Write-Host ''
  exit 0
}

Write-Bad "Could not confirm the change (anonymous_users = $verified)."
Write-Host '    The setting may need a moment to propagate, or the API may have'
Write-Host '    rejected the patch. Toggle it manually in the dashboard:'
Write-Host '      Authentication -> Sign In / Providers -> Email -> Enable anonymous sign-ins'
exit 1
