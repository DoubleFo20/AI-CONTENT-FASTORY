# Windows-only synthetic regression; never uses Owner data or a real provider.
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskTempRoot = Join-Path $taskRoot '.tmp'
$taskChecked = $taskTempRoot
while ($taskChecked) {
    $taskEntry = Get-Item -LiteralPath $taskChecked -Force -ErrorAction SilentlyContinue
    if ($taskEntry -and ($taskEntry.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'UNSAFE_TEST_PATH' }
    $taskChecked = [IO.Path]::GetDirectoryName($taskChecked)
}
$taskFixture = Join-Path $taskTempRoot ('gemini-local-regression-' + [Guid]::NewGuid().ToString('N'))
$taskChild = $null
$taskPassed = 0
$taskStep = 'fixture'
function Check([bool]$Condition) {
    if (-not $Condition) { throw 'SYNTHETIC_CHECK_FAILED' }
    $script:taskPassed++
}
try {
    [void][IO.Directory]::CreateDirectory((Join-Path $taskFixture 'scripts'))
    [void][IO.Directory]::CreateDirectory((Join-Path $taskFixture 'dist/api/server'))
    foreach ($taskName in @('gemini-local.ps1', 'start-gemini-local.mjs')) {
        Copy-Item -LiteralPath (Join-Path $taskRoot "scripts/$taskName") -Destination (Join-Path $taskFixture "scripts/$taskName")
    }
    @'
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const blocked = ['NODE_OPTIONS','OPENAI_API_KEY','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','SUPABASE_URL','SUPABASE_SECRET_KEY','ACF_VERIFY_PASSWORD'];
writeFileSync(join(process.env.ACF_DATA_DIR, 'synthetic-check.json'), JSON.stringify({
  keyPresent: Boolean(process.env.GEMINI_API_KEY), freeConfirmed: process.env.ACF_GEMINI_FREE_TIER_CONFIRMED === 'true',
  isolated: process.env.ACF_AI_MODE === 'gemini' && process.env.ACF_OPENAI_REQUESTS_APPROVED === 'false' && process.env.ACF_CLOUD_WORKER === 'false',
  models: process.env.GEMINI_IDEAS_MODEL === 'gemini-3.5-flash-lite' && process.env.GEMINI_EXPANSION_MODEL === 'gemini-3.5-flash-lite',
  inheritedSecretsAbsent: blocked.every(name => process.env[name] === undefined),
}));
createServer((_req, res) => { res.setHeader('Content-Type','application/json'); res.end('{"ok":true}'); }).listen(Number(process.env.ACF_PORT), '127.0.0.1');
'@ | Set-Content -LiteralPath (Join-Path $taskFixture 'dist/api/server/index.js') -Encoding UTF8
    @'
param([string]$Action, [int]$Port = 3013)
[Threading.Thread]::CurrentThread.CurrentCulture = [Globalization.CultureInfo]::GetCultureInfo('th-TH')
function Read-Host { param([string]$Prompt, [switch]$AsSecureString)
    if ($AsSecureString) { return (ConvertTo-SecureString ('SYNTHETIC_' + [Guid]::NewGuid().ToString('N')) -AsPlainText -Force) }
    return 'FREE'
}
$env:NODE_OPTIONS = '--inspect=0'
foreach ($taskName in @('OPENAI_API_KEY','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','SUPABASE_URL','SUPABASE_SECRET_KEY','ACF_VERIFY_PASSWORD')) { [Environment]::SetEnvironmentVariable($taskName,'SYNTHETIC_SENTINEL','Process') }
& (Join-Path $PSScriptRoot 'scripts/gemini-local.ps1') -Action $Action -Port $Port
exit $LASTEXITCODE
'@ | Set-Content -LiteralPath (Join-Path $taskFixture 'wrapper.ps1') -Encoding UTF8
    $taskShell = (Get-Process -Id $PID).Path
    $taskWrapper = Join-Path $taskFixture 'wrapper.ps1'
    $taskStep = 'configure'
    $taskConfigOutput = & $taskShell -NoProfile -ExecutionPolicy Bypass -File $taskWrapper -Action Configure 2>$null
    Check ($LASTEXITCODE -eq 0)
    $taskConfigured = ($taskConfigOutput -join '') | ConvertFrom-Json
    Check ($taskConfigured.configured -eq $true -and $taskConfigured.liveRequests -eq 0 -and $taskConfigured.billingChanged -eq $false)
    $taskFile = Join-Path $taskFixture '.tmp/gemini-private/credentials.local'
    $taskHash = (Get-FileHash -LiteralPath $taskFile).Hash
    $taskStored = Get-Content -LiteralPath $taskFile -Raw | ConvertFrom-Json
    $taskDecoded = ConvertTo-SecureString -String $taskStored.encryptedKey
    try { Check ([Net.NetworkCredential]::new('', $taskDecoded).Password.StartsWith('SYNTHETIC_')) }
    finally { $taskDecoded.Dispose() }
    Check (-not (($taskConfigOutput -join '') -match 'SYNTHETIC_|encryptedKey'))
    $taskIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    foreach ($taskPath in @((Join-Path $taskFixture '.tmp'), (Join-Path $taskFixture '.tmp/gemini-private'), $taskFile)) {
        $taskAcl = Get-Acl -LiteralPath $taskPath
        Check ($taskAcl.GetOwner([Security.Principal.SecurityIdentifier]).Value -eq $taskIdentity.Value -and
            @($taskAcl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]) | Where-Object { $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Value -ne $taskIdentity.Value }).Count -eq 0)
    }
    $taskStep = 'no-overwrite'
    $ErrorActionPreference = 'Continue'
    $null = & $taskShell -NoProfile -ExecutionPolicy Bypass -File $taskWrapper -Action Configure 2>$null
    $ErrorActionPreference = 'Stop'
    Check ($LASTEXITCODE -ne 0 -and (Get-FileHash -LiteralPath $taskFile).Hash -eq $taskHash)
    $taskReservation = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $taskReservation.Start()
    $taskPort = $taskReservation.LocalEndpoint.Port
    try {
        $taskStep = 'occupied-port'
        $ErrorActionPreference = 'Continue'
        $null = & $taskShell -NoProfile -ExecutionPolicy Bypass -File $taskWrapper -Action Start -Port $taskPort 2>$null
        $ErrorActionPreference = 'Stop'
        Check ($LASTEXITCODE -ne 0 -and -not (Test-Path -LiteralPath (Join-Path $taskFixture 'storage')))
    } finally { $taskReservation.Stop() }
    # Repeated ACL validation and multiple installed Node paths must allow a real ready child.
    $taskStep = 'startup'
    $taskStartOutput = & $taskShell -NoProfile -ExecutionPolicy Bypass -File $taskWrapper -Action Start -Port $taskPort 2>$null
    Check ($LASTEXITCODE -eq 0)
    $taskState = ($taskStartOutput -join '') | ConvertFrom-Json
    $taskChild = Get-Process -Id $taskState.pid
    Check ($taskState.ready -eq $true -and $taskState.isolatedCanary -eq $true -and $taskState.generationStarted -eq $false)
    Check ([IO.Path]::GetDirectoryName($taskState.dataDirectory) -eq (Join-Path $taskFixture 'storage') -and
        [IO.Path]::GetFileName($taskState.dataDirectory).StartsWith('gemini-canary-'))
    $taskChecks = Get-Content -LiteralPath (Join-Path $taskState.dataDirectory 'synthetic-check.json') -Raw | ConvertFrom-Json
    Check ($taskChecks.keyPresent -and $taskChecks.freeConfirmed -and $taskChecks.isolated -and $taskChecks.models -and $taskChecks.inheritedSecretsAbsent)
    Check (-not (($taskStartOutput -join '') -match 'SYNTHETIC_|encryptedKey'))
    [PSCustomObject]@{ checksPassed = $taskPassed; syntheticOnly = $true; liveRequests = 0; ownerDataTouched = $false } | ConvertTo-Json -Compress
} catch {
    [Console]::Error.WriteLine("Synthetic Gemini setup regression failed at ${taskStep} after ${taskPassed} checks ($($_.Exception.GetType().Name)); no key/ciphertext or raw exception printed.")
    exit 1
} finally {
    if ($taskChild) { try { if (-not $taskChild.HasExited) { $taskChild.Kill() } } catch { } }
    # If startup failed after spawn, recover only this fixture's positively identified child.
    foreach ($taskMetadataFile in @(Get-ChildItem -LiteralPath (Join-Path $taskFixture '.tmp/gemini-private') -Filter '*.process.json' -ErrorAction SilentlyContinue)) {
        try {
            $taskMetadata = Get-Content -LiteralPath $taskMetadataFile.FullName -Raw | ConvertFrom-Json
            $taskCandidate = Get-Process -Id $taskMetadata.pid -ErrorAction SilentlyContinue
            $taskTime = if ($taskMetadata.startedAt -is [DateTime]) { $taskMetadata.startedAt.ToUniversalTime() }
                else { [DateTimeOffset]::Parse([string]$taskMetadata.startedAt, [Globalization.CultureInfo]::InvariantCulture).UtcDateTime }
            if ($taskCandidate -and $taskCandidate.ProcessName -eq 'node' -and
                [Math]::Abs(($taskCandidate.StartTime.ToUniversalTime() - $taskTime).TotalSeconds) -le 2 -and
                [IO.Path]::GetDirectoryName($taskMetadata.dataDirectory) -eq (Join-Path $taskFixture 'storage')) {
                # PID/start-time and exact fresh fixture metadata bind this process; no CIM query.
                $taskCandidate.Kill()
            }
        } catch { }
    }
    # Preserve the exact isolated fixture for diagnosis; no recursive deletion.
}
