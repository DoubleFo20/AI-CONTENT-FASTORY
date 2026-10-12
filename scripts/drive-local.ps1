[CmdletBinding()]
param([string]$Action = 'Status')

$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskTemporaryDir = Join-Path $taskRoot '.tmp'
$taskPrivateDir = Join-Path $taskTemporaryDir 'drive-private'
$taskConfigPath = Join-Path $taskPrivateDir 'credentials.local'
$taskCallback = 'http://127.0.0.1:3006/api/integrations/drive/callback'
$taskClientIdSecure = $null
$taskSecretSecure = $null
$taskVaultSecure = $null
$taskClientId = $null
$taskSecret = $null
$taskVaultKey = $null
$taskRandomBytes = $null
$taskFailureCode = 'DRIVE_LOCAL_SETUP_FAILED'

function Assert-NoReparse([string]$Path) {
    $taskChecked = [IO.Path]::GetFullPath($Path)
    $taskLeaf = $true
    while ($taskChecked) {
        $taskItem = $null
        try { $taskItem = Get-Item -LiteralPath $taskChecked -Force -ErrorAction Stop }
        catch { if ($_.Exception -isnot [System.Management.Automation.ItemNotFoundException]) { throw 'PRIVATE_PATH_UNSAFE' } }
        if ($null -ne $taskItem) {
            if ($taskItem.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'PRIVATE_PATH_UNSAFE' }
            if (-not $taskLeaf -and -not $taskItem.PSIsContainer) { throw 'PRIVATE_PATH_UNSAFE' }
        }
        $taskLeaf = $false
        $taskChecked = [IO.Path]::GetDirectoryName($taskChecked)
    }
}

function Assert-PrivateAcl([string]$Path, [bool]$Directory) {
    Assert-NoReparse $Path
    $taskItem = Get-Item -LiteralPath $Path -Force
    if ([bool]$taskItem.PSIsContainer -ne $Directory) { throw 'PRIVATE_PATH_UNSAFE' }
    $taskIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $taskAcl = Get-Acl -LiteralPath $Path
    if (-not $taskAcl.AreAccessRulesProtected -or
        $taskAcl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $taskIdentity.Value) { throw 'PRIVATE_ACL_UNSAFE' }
    $taskRules = @($taskAcl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
    if (@($taskRules | Where-Object { $_.AccessControlType -ne 'Allow' -or $_.IdentityReference.Value -ne $taskIdentity.Value -or $_.IsInherited }).Count -gt 0 -or
        @($taskRules | Where-Object { ($_.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq
            [Security.AccessControl.FileSystemRights]::FullControl -and -not ($_.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) }).Count -lt 1) {
        throw 'PRIVATE_ACL_UNSAFE'
    }
}

function New-PrivateAcl([bool]$Directory) {
    $taskIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $taskAcl = if ($Directory) { [Security.AccessControl.DirectorySecurity]::new() } else { [Security.AccessControl.FileSecurity]::new() }
    $taskAcl.SetOwner($taskIdentity)
    $taskAcl.SetAccessRuleProtection($true, $false)
    $taskInheritance = if ($Directory) { [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit }
        else { [Security.AccessControl.InheritanceFlags]::None }
    $taskAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($taskIdentity,
        [Security.AccessControl.FileSystemRights]::FullControl, $taskInheritance,
        [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow))
    return $taskAcl
}

function Ensure-NewPrivateDirectory([string]$Path) {
    Assert-NoReparse $Path
    if (-not (Test-Path -LiteralPath $Path)) {
        # Windows PowerShell 5.1 creates the directory with its private DACL in one operation.
        [void][IO.Directory]::CreateDirectory($Path, (New-PrivateAcl $true))
    }
    # Never repair or replace an existing shared directory's permissions.
    Assert-PrivateAcl $Path $true
}

function Assert-ExistingPrivatePaths {
    Assert-NoReparse $taskConfigPath
    foreach ($taskPath in @($taskTemporaryDir, $taskPrivateDir)) {
        if (Test-Path -LiteralPath $taskPath) { Assert-PrivateAcl $taskPath $true }
    }
    if (Test-Path -LiteralPath $taskConfigPath) { Assert-PrivateAcl $taskConfigPath $false }
}

function Test-ClientId([string]$Value) {
    return $null -ne $Value -and $Value -cmatch '\A[0-9]{6,32}-[A-Za-z0-9_-]{8,128}\.apps\.googleusercontent\.com\z'
}

function Test-DpapiEnvelope($Value) {
    # Inspect only the DPAPI envelope shape. Status must never decrypt a secret.
    return $Value -is [string] -and $Value.Length -ge 128 -and $Value.Length -le 8192 -and
        $Value.Length % 2 -eq 0 -and $Value -cmatch '\A01000000d08c9ddf0115d1118c7a00c04fc297eb[0-9a-f]+\z'
}

function Read-ConfigurationShape {
    Assert-ExistingPrivatePaths
    $taskStream = [IO.File]::Open($taskConfigPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        if ($taskStream.Length -lt 1 -or $taskStream.Length -gt 20000) { throw 'PRIVATE_CONFIGURATION_INVALID' }
        $taskReader = [IO.StreamReader]::new($taskStream, [Text.UTF8Encoding]::new($false, $true), $false)
        try {
            $taskRaw = $taskReader.ReadToEnd()
            # A fixed scalar schema also rejects duplicate/escaped property names before JSON decoding.
            $taskValuePattern = '(?:1|"(?:[^"\\\x00-\x1f]|\\["\\/bfnrt]|\\u[0-9A-Fa-f]{4})*")'
            $taskPropertyPattern = '"(?<field>schema|callbackUri|clientId|encryptedClientSecret|encryptedVaultKey)"\s*:\s*' + $taskValuePattern
            $taskPattern = '\A\s*\{\s*' + $taskPropertyPattern + '\s*(?:,\s*' + $taskPropertyPattern + '\s*){4}\}\s*\z'
            $taskMatch = [Text.RegularExpressions.Regex]::Match($taskRaw, $taskPattern,
                [Text.RegularExpressions.RegexOptions]::CultureInvariant, [TimeSpan]::FromMilliseconds(500))
            if (-not $taskMatch.Success -or @($taskMatch.Groups['field'].Captures.Value | Select-Object -Unique).Count -ne 5) { throw 'PRIVATE_CONFIGURATION_INVALID' }
            $taskStored = $taskRaw | ConvertFrom-Json
        } catch { throw 'PRIVATE_CONFIGURATION_INVALID' }
        finally { $taskReader.Dispose() }
    } finally { $taskStream.Dispose() }
    $taskFields = @('schema', 'callbackUri', 'clientId', 'encryptedClientSecret', 'encryptedVaultKey')
    if ($null -eq $taskStored -or $taskStored -is [Array] -or $taskStored -isnot [PSCustomObject] -or
        @($taskStored.PSObject.Properties).Count -ne $taskFields.Count -or
        @($taskStored.PSObject.Properties.Name | Where-Object { $_ -cnotin $taskFields }).Count -gt 0 -or
        $taskStored.schema -isnot [int] -or $taskStored.schema -ne 1 -or
        $taskStored.callbackUri -isnot [string] -or $taskStored.callbackUri -cne $taskCallback -or
        $taskStored.clientId -isnot [string] -or -not (Test-ClientId $taskStored.clientId) -or
        -not (Test-DpapiEnvelope $taskStored.encryptedClientSecret) -or -not (Test-DpapiEnvelope $taskStored.encryptedVaultKey)) {
        throw 'PRIVATE_CONFIGURATION_INVALID'
    }
    # This is presence/shape only; DPAPI authenticity can be checked only by a future approved loader.
}

function Convert-SecureInput([Security.SecureString]$Value) {
    $taskPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer) }
}

try {
    if ($env:OS -ne 'Windows_NT') { throw 'WINDOWS_REQUIRED' }
    if ($Action -cnotin @('Status', 'Configure')) { throw 'INVALID_ACTION' }
    Assert-ExistingPrivatePaths
    if ($Action -ceq 'Status') {
        $taskPresent = Test-Path -LiteralPath $taskConfigPath
        if ($taskPresent) { Read-ConfigurationShape }
        [PSCustomObject]@{ encryptedLocalConfigurationPresent = [bool]$taskPresent;
            clientIdPresent = [bool]$taskPresent; clientSecretPresent = [bool]$taskPresent; vaultKeyPresent = [bool]$taskPresent;
            callbackUri = $taskCallback; oauthVerifiedByThisTool = $false } | ConvertTo-Json -Compress
    } else {
        if (Test-Path -LiteralPath $taskConfigPath) { throw 'PRIVATE_CONFIGURATION_ALREADY_EXISTS' }
        $taskClientIdSecure = Read-Host 'Google OAuth Web client ID (hidden; enter locally)' -AsSecureString
        if ($null -eq $taskClientIdSecure -or $taskClientIdSecure.Length -gt 256) { throw 'GOOGLE_CLIENT_ID_INVALID' }
        $taskClientId = Convert-SecureInput $taskClientIdSecure
        if (-not (Test-ClientId $taskClientId)) { throw 'GOOGLE_CLIENT_ID_INVALID' }
        $taskSecretSecure = Read-Host 'Google OAuth Web client secret (hidden; never paste into chat)' -AsSecureString
        if ($null -eq $taskSecretSecure -or $taskSecretSecure.Length -lt 16 -or $taskSecretSecure.Length -gt 256) { throw 'GOOGLE_CLIENT_SECRET_INVALID' }
        $taskSecret = Convert-SecureInput $taskSecretSecure
        if ($taskSecret -cnotmatch '\A[A-Za-z0-9_-]{16,256}\z' -or $taskSecret.StartsWith('AIza', [StringComparison]::Ordinal)) { throw 'GOOGLE_CLIENT_SECRET_INVALID' }
        $taskSecret = $null
        Ensure-NewPrivateDirectory $taskTemporaryDir
        Ensure-NewPrivateDirectory $taskPrivateDir
        Assert-ExistingPrivatePaths
        if (Test-Path -LiteralPath $taskConfigPath) { throw 'PRIVATE_CONFIGURATION_ALREADY_EXISTS' }
        $taskRandomBytes = New-Object byte[] 32
        $taskRng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $taskRng.GetBytes($taskRandomBytes) } finally { $taskRng.Dispose() }
        $taskVaultKey = [Convert]::ToBase64String($taskRandomBytes)
        $taskVaultSecure = ConvertTo-SecureString -String $taskVaultKey -AsPlainText -Force
        $taskVaultKey = $null
        [Array]::Clear($taskRandomBytes, 0, $taskRandomBytes.Length)
        $taskPayload = @{ schema = 1; callbackUri = $taskCallback; clientId = $taskClientId;
            encryptedClientSecret = (ConvertFrom-SecureString $taskSecretSecure);
            encryptedVaultKey = (ConvertFrom-SecureString $taskVaultSecure) } | ConvertTo-Json -Compress
        $taskClientId = $null
        $taskPendingPath = Join-Path $taskPrivateDir ([Guid]::NewGuid().ToString('N') + '.pending')
        Assert-ExistingPrivatePaths
        $taskStream = [IO.FileStream]::new($taskPendingPath, [IO.FileMode]::CreateNew,
            [Security.AccessControl.FileSystemRights]::Write, [IO.FileShare]::None, 4096,
            [IO.FileOptions]::WriteThrough, (New-PrivateAcl $false))
        try {
            $taskBytes = [Text.Encoding]::UTF8.GetBytes($taskPayload)
            $taskStream.Write($taskBytes, 0, $taskBytes.Length)
            $taskStream.Flush($true)
        } finally { $taskStream.Dispose() }
        Assert-ExistingPrivatePaths
        Assert-PrivateAcl $taskPendingPath $false
        # Same-directory atomic move refuses existing credentials, preserving the original vault key.
        [IO.File]::Move($taskPendingPath, $taskConfigPath)
        Assert-PrivateAcl $taskConfigPath $false
        [PSCustomObject]@{ configured = $true; encryptedForCurrentWindowsUser = $true;
            backendOnly = $true; callbackUri = $taskCallback; oauthVerifiedByThisTool = $false } | ConvertTo-Json -Compress
    }
} catch {
    $taskKnown = @('WINDOWS_REQUIRED', 'INVALID_ACTION', 'PRIVATE_PATH_UNSAFE', 'PRIVATE_ACL_UNSAFE',
        'PRIVATE_CONFIGURATION_INVALID', 'PRIVATE_CONFIGURATION_ALREADY_EXISTS', 'GOOGLE_CLIENT_ID_INVALID', 'GOOGLE_CLIENT_SECRET_INVALID')
    if ($_.Exception.Message -cin $taskKnown) { $taskFailureCode = $_.Exception.Message }
    [Console]::Error.WriteLine("${taskFailureCode}: local setup stopped safely.")
    exit 1
} finally {
    $taskClientId = $null
    $taskSecret = $null
    $taskVaultKey = $null
    $taskPayload = $null
    if ($null -ne $taskRandomBytes) { [Array]::Clear($taskRandomBytes, 0, $taskRandomBytes.Length) }
    foreach ($taskSecure in @($taskClientIdSecure, $taskSecretSecure, $taskVaultSecure)) {
        if ($null -ne $taskSecure) { $taskSecure.Dispose() }
    }
    # An interrupted encrypted .pending file remains private; never delete or rotate credentials.
}
