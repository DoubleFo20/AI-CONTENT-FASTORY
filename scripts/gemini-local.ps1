[CmdletBinding()]
param(
    [ValidateSet('Status', 'Configure', 'Start')]
    [string]$Action = 'Status',
    [ValidateRange(1024, 65535)]
    [int]$Port = 3013
)

$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskTemporaryDir = Join-Path $taskRoot '.tmp'
$taskPrivateDir = Join-Path $taskTemporaryDir 'gemini-private'
$taskConfigPath = Join-Path $taskPrivateDir 'credentials.local'
$taskModel = 'gemini-3.5-flash-lite'
$taskSecure = $null
$taskCredential = $null
$taskStart = $null
$taskTemporaryFile = $null
$taskNewProcess = $null
$taskOwnedChild = $false
$taskLaunch = $null
$taskFailureCode = 'GEMINI_LOCAL_SETUP_FAILED'

function Assert-NoReparse([string]$Path) {
    $taskChecked = [IO.Path]::GetFullPath($Path)
    while ($taskChecked) {
        $taskItem = Get-Item -LiteralPath $taskChecked -Force -ErrorAction SilentlyContinue
        if ($null -ne $taskItem -and ($taskItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'PRIVATE_PATH_UNSAFE' }
        $taskChecked = [IO.Path]::GetDirectoryName($taskChecked)
    }
}

function Assert-PrivateAcl([string]$Path) {
    Assert-NoReparse $Path
    $taskIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $taskAcl = Get-Acl -LiteralPath $Path
    if ($taskAcl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $taskIdentity.Value) { throw 'PRIVATE_ACL_UNSAFE' }
    $taskRules = $taskAcl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
    if (@($taskRules | Where-Object { $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Value -ne $taskIdentity.Value }).Count -gt 0) { throw 'PRIVATE_ACL_UNSAFE' }
    if (@($taskRules | Where-Object { $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Value -eq $taskIdentity.Value -and
        ($_.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl }).Count -lt 1) { throw 'PRIVATE_ACL_UNSAFE' }
}

function Set-PrivateDirectory([string]$Path) {
    Assert-NoReparse $Path
    if (-not (Test-Path -LiteralPath $Path)) { [void][IO.Directory]::CreateDirectory($Path) }
    Assert-NoReparse $Path
    # Preserve an already verified ACL; reapplying ownership needs unnecessary Windows privileges.
    try { Assert-PrivateAcl $Path; return }
    catch { if ($_.Exception.Message -ne 'PRIVATE_ACL_UNSAFE') { throw } }
    $taskIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $taskAcl = [Security.AccessControl.DirectorySecurity]::new()
    $taskAcl.SetOwner($taskIdentity)
    $taskAcl.SetAccessRuleProtection($true, $false)
    $taskInheritance = [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
    $taskAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($taskIdentity,
        [Security.AccessControl.FileSystemRights]::FullControl, $taskInheritance,
        [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow))
    Set-Acl -LiteralPath $Path -AclObject $taskAcl
    Assert-PrivateAcl $Path
}

function Read-BackendCredential {
    # Confirmation and key must come from the same source/scope.
    Assert-NoReparse $taskConfigPath
    if (Test-Path -LiteralPath $taskConfigPath) {
        Assert-PrivateAcl $taskTemporaryDir
        Assert-PrivateAcl $taskPrivateDir
        Assert-PrivateAcl $taskConfigPath
        $taskStored = Get-Content -LiteralPath $taskConfigPath -Raw | ConvertFrom-Json
        if ($taskStored.schema -ne 1 -or $taskStored.freeTierConfirmed -ne $true -or $taskStored.model -ne $taskModel) { throw 'PRIVATE_CONFIGURATION_INVALID' }
        $taskDecoded = ConvertTo-SecureString -String $taskStored.encryptedKey
        try { return @{ Key = [Net.NetworkCredential]::new('', $taskDecoded).Password; Source = 'windows-user-dpapi' } }
        finally { $taskDecoded.Dispose() }
    }
    foreach ($taskScope in @('Process', 'User')) {
        $taskCandidate = [Environment]::GetEnvironmentVariable('GEMINI_API_KEY', $taskScope)
        if (-not [string]::IsNullOrWhiteSpace($taskCandidate)) {
            if ([Environment]::GetEnvironmentVariable('ACF_GEMINI_FREE_TIER_CONFIRMED', $taskScope) -cne 'true') { throw 'FREE_TIER_CONFIRMATION_REQUIRED' }
            return @{ Key = $taskCandidate; Source = 'private-environment' }
        }
    }
    throw 'GEMINI_KEY_REQUIRED'
}

function Test-OwnedListener([int]$ListenerPort, [int]$ListenerPid) {
    # CIM can stall on Windows. Bound the native query as well as the outer readiness loop.
    $taskProbeStart = [Diagnostics.ProcessStartInfo]::new()
    $taskProbeStart.FileName = Join-Path ([Environment]::GetEnvironmentVariable('SystemRoot')) 'System32/netstat.exe'
    $taskProbeStart.Arguments = '-ano -p tcp'
    $taskProbeStart.UseShellExecute = $false
    $taskProbeStart.CreateNoWindow = $true
    $taskProbeStart.RedirectStandardOutput = $true
    $taskProbeStart.RedirectStandardError = $true
    $taskProbe = [Diagnostics.Process]::Start($taskProbeStart)
    try {
        $taskRead = $taskProbe.StandardOutput.ReadToEndAsync()
        $taskReadError = $taskProbe.StandardError.ReadToEndAsync()
        if (-not $taskProbe.WaitForExit(2000)) { $taskProbe.Kill(); return $false }
        if ($taskProbe.ExitCode -ne 0) { return $false }
        [void]$taskReadError.GetAwaiter().GetResult()
        foreach ($taskLine in ($taskRead.GetAwaiter().GetResult() -split '\r?\n')) {
            $taskColumns = $taskLine.Trim() -split '\s+'
            if ($taskColumns.Count -eq 5 -and $taskColumns[0] -eq 'TCP' -and $taskColumns[1] -eq "127.0.0.1:$ListenerPort" -and
                $taskColumns[3] -eq 'LISTENING' -and $taskColumns[4] -eq [string]$ListenerPid) { return $true }
        }
        return $false
    } finally { $taskProbe.Dispose() }
}

try {
    if ($env:OS -ne 'Windows_NT') { throw 'WINDOWS_REQUIRED' }
    Assert-NoReparse $taskConfigPath
    if ($Action -eq 'Status') {
        [PSCustomObject]@{
            encryptedLocalConfigurationPresent = (Test-Path -LiteralPath $taskConfigPath)
            processKeyPresent = (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('GEMINI_API_KEY', 'Process')))
            userKeyPresent = (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('GEMINI_API_KEY', 'User')))
            freeTierProjectVerifiedByThisTool = $false; model = $taskModel; liveRequests = 0
        } | ConvertTo-Json -Compress
        exit 0
    }
    if ($Action -eq 'Configure') {
        if (Test-Path -LiteralPath $taskConfigPath) { throw 'PRIVATE_CONFIGURATION_ALREADY_EXISTS' }
        if ((Read-Host 'Confirm this API project uses Free Tier with billing disabled; type FREE') -cne 'FREE') { throw 'FREE_TIER_CONFIRMATION_REQUIRED' }
        $taskSecure = Read-Host 'Gemini API key (hidden; never paste into chat)' -AsSecureString
        if ($taskSecure.Length -lt 16 -or $taskSecure.Length -gt 4096) { throw 'GEMINI_KEY_INVALID' }
        Set-PrivateDirectory $taskTemporaryDir
        Set-PrivateDirectory $taskPrivateDir
        $taskPayload = @{ schema = 1; encryptedKey = (ConvertFrom-SecureString $taskSecure);
            freeTierConfirmed = $true; model = $taskModel } | ConvertTo-Json -Compress
        $taskTemporaryFile = Join-Path $taskPrivateDir ([Guid]::NewGuid().ToString() + '.pending')
        $taskStream = [IO.File]::Open($taskTemporaryFile, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try {
            $taskBytes = [Text.Encoding]::UTF8.GetBytes($taskPayload)
            $taskStream.Write($taskBytes, 0, $taskBytes.Length)
            $taskStream.Flush($true)
        } finally { $taskStream.Dispose() }
        Assert-PrivateAcl $taskTemporaryFile
        # Atomic no-overwrite move; an interrupted write never becomes active configuration.
        [IO.File]::Move($taskTemporaryFile, $taskConfigPath)
        $taskTemporaryFile = $null
        [PSCustomObject]@{ configured = $true; encryptedForCurrentWindowsUser = $true;
            backendOnly = $true; liveRequests = 0; billingChanged = $false } | ConvertTo-Json -Compress
        exit 0
    }
    # Start creates fresh isolated canary storage. It never stops an existing application.
    if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'dist/api/server/index.js'))) { throw 'BUILD_REQUIRED' }
    $taskCredential = Read-BackendCredential
    if ($taskCredential.Key.Length -lt 16 -or $taskCredential.Key.Length -gt 4096 -or $taskCredential.Key -match '\s') { throw 'GEMINI_KEY_INVALID' }
    Set-PrivateDirectory $taskTemporaryDir
    Set-PrivateDirectory $taskPrivateDir
    $taskNode = (Get-Command node -CommandType Application | Select-Object -First 1).Source
    $taskStart = [Diagnostics.ProcessStartInfo]::new()
    $taskStart.FileName = $taskNode
    $taskStart.Arguments = 'scripts/start-gemini-local.mjs'
    $taskStart.WorkingDirectory = $taskRoot
    $taskStart.UseShellExecute = $false
    $taskStart.CreateNoWindow = $true
    $taskStart.RedirectStandardOutput = $true
    $taskStart.RedirectStandardError = $true
    # No NODE_OPTIONS/preloads, inspector, other providers, OAuth, cloud or verifier passwords.
    $taskStart.EnvironmentVariables.Clear()
    foreach ($taskVariable in @('SystemRoot', 'SystemDrive', 'WINDIR', 'TEMP', 'TMP', 'PATH', 'PATHEXT', 'LOCALAPPDATA', 'APPDATA')) {
        $taskValue = [Environment]::GetEnvironmentVariable($taskVariable, 'Process')
        if ($null -ne $taskValue) { $taskStart.EnvironmentVariables[$taskVariable] = $taskValue }
    }
    $taskStart.EnvironmentVariables['GEMINI_API_KEY'] = $taskCredential.Key
    $taskStart.EnvironmentVariables['ACF_GEMINI_FREE_TIER_CONFIRMED'] = 'true'
    $taskStart.EnvironmentVariables['ACF_PORT'] = [string]$Port
    $taskLaunch = [Diagnostics.Process]::Start($taskStart)
    $taskStart.EnvironmentVariables.Remove('GEMINI_API_KEY')
    $taskCredential.Key = $null
    if (-not $taskLaunch.WaitForExit(10000)) { throw 'STARTUP_TIMEOUT' }
    $taskOutput = $taskLaunch.StandardOutput.ReadToEnd()
    [void]$taskLaunch.StandardError.ReadToEnd()
    $taskState = $taskOutput | ConvertFrom-Json
    if ($taskLaunch.ExitCode -ne 0 -or $taskState.spawned -ne $true) {
        if ($taskState.code -in @('OWNER_PORT_ALREADY_SERVING', 'BUILD_REQUIRED', 'PRIVATE_PATH_UNSAFE', 'PRIVATE_ACL_UNSAFE')) { throw [string]$taskState.code }
        throw 'STARTUP_FAILED'
    }
    $taskNewProcess = Get-Process -Id $taskState.pid
    $taskStartedAt = if ($taskState.startedAt -is [DateTime]) { $taskState.startedAt.ToUniversalTime() }
        else { [DateTimeOffset]::Parse([string]$taskState.startedAt, [Globalization.CultureInfo]::InvariantCulture).UtcDateTime }
    if ($taskNewProcess.ProcessName -ne 'node' -or [Math]::Abs(($taskNewProcess.StartTime.ToUniversalTime() - $taskStartedAt).TotalSeconds) -gt 2) { throw 'STARTUP_OWNERSHIP_UNVERIFIED' }
    $taskOwnedChild = $true
    $taskWatch = [Diagnostics.Stopwatch]::StartNew()
    $taskReady = $false
    while ($taskWatch.ElapsedMilliseconds -lt 15000 -and -not $taskNewProcess.HasExited) {
        if (Test-OwnedListener $Port $taskNewProcess.Id) {
            try {
                $taskResponse = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
                $taskBody = $taskResponse.Content | ConvertFrom-Json
                if ($taskResponse.StatusCode -eq 200 -and $taskBody.ok -eq $true) { $taskReady = $true; break }
            } catch { # Observe until deadline; never issue generation requests.
            }
        }
        Start-Sleep -Milliseconds 100
    }
    if (-not $taskReady) { throw 'STARTUP_NOT_READY' }
    $taskNewProcess = $null
    [PSCustomObject]@{ ready = $true; pid = $taskState.pid; port = $Port; dataDirectory = $taskState.dataDirectory;
        isolatedCanary = $true; generationStarted = $false; billingChanged = $false } | ConvertTo-Json -Compress
} catch {
    $taskKnown = @('WINDOWS_REQUIRED', 'PRIVATE_PATH_UNSAFE', 'PRIVATE_ACL_UNSAFE', 'PRIVATE_CONFIGURATION_INVALID',
        'PRIVATE_CONFIGURATION_ALREADY_EXISTS', 'FREE_TIER_CONFIRMATION_REQUIRED', 'GEMINI_KEY_REQUIRED', 'GEMINI_KEY_INVALID',
        'BUILD_REQUIRED', 'OWNER_PORT_ALREADY_SERVING', 'STARTUP_TIMEOUT', 'STARTUP_FAILED', 'STARTUP_NOT_READY', 'STARTUP_OWNERSHIP_UNVERIFIED')
    if ($_.Exception.Message -in $taskKnown) { $taskFailureCode = $_.Exception.Message }
    # Only a positively identified child from this invocation may be stopped.
    if ($taskOwnedChild -and $null -ne $taskNewProcess) {
        try { if (-not $taskNewProcess.HasExited) { $taskNewProcess.Kill() } } catch { }
    }
    if ($taskFailureCode -eq 'STARTUP_TIMEOUT' -and $null -ne $taskLaunch) {
        try { if (-not $taskLaunch.HasExited) { $taskLaunch.Kill() } } catch { }
    }
    [Console]::Error.WriteLine("${taskFailureCode}: configuration stopped safely; no generation request or billing change.")
    exit 1
} finally {
    if ($null -ne $taskStart) { $taskStart.EnvironmentVariables.Remove('GEMINI_API_KEY') }
    if ($null -ne $taskCredential) { $taskCredential.Key = $null }
    if ($null -ne $taskSecure) { $taskSecure.Dispose() }
    if ($taskTemporaryFile -and (Test-Path -LiteralPath $taskTemporaryFile)) {
        try { Assert-PrivateAcl $taskTemporaryFile; [IO.File]::Delete($taskTemporaryFile) } catch { }
    }
}
