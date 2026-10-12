import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const callbackUri = 'http://127.0.0.1:3006/api/integrations/drive/callback';
const clientId = '123456789012-syntheticlocalclientonly.apps.googleusercontent.com';
const clientSecret = 'SYNTHETIC_CLIENT_SECRET_ONLY_123456';
const windows = { skip: process.platform !== 'win32' };
// A Node hop can retain PowerShell 7's incompatible PSModulePath. Let 5.1 discover its own
// native modules and keep all real provider credentials out of synthetic child processes.
const shellEnvironment: NodeJS.ProcessEnv = {};
const environmentNames = new Set(['systemroot', 'systemdrive', 'windir', 'temp', 'tmp', 'path',
  'pathext', 'localappdata', 'appdata', 'userprofile', 'os']);
for (const [name, value] of Object.entries(process.env)) {
  if (environmentNames.has(name.toLowerCase())) shellEnvironment[name] = value;
}
const wrapper = `
param([string]$Action = 'Status', [string]$Case = 'valid')
$ErrorActionPreference = 'Stop'
[Threading.Thread]::CurrentThread.CurrentCulture = [Globalization.CultureInfo]::GetCultureInfo('th-TH')
[Threading.Thread]::CurrentThread.CurrentUICulture = [Globalization.CultureInfo]::GetCultureInfo('th-TH')
function Read-Host {
    param([string]$Prompt, [switch]$AsSecureString)
    if (-not $AsSecureString) { throw 'FIXTURE_REQUIRES_HIDDEN_INPUT' }
    if ($Case -eq 'no-read') { throw 'FIXTURE_MUST_NOT_PROMPT' }
    $value = if ($Prompt -like '*client ID*') {
        switch ($Case) {
            'bad-id' { 'wrong.example.com' }
            'newline-id' { "${clientId}\n" }
            'long-id' { 'x' * 257 }
            default { '${clientId}' }
        }
    } else {
        switch ($Case) {
            'short-secret' { 'short' }
            'whitespace-secret' { 'SYNTHETIC SECRET ONLY' }
            'newline-secret' { "${clientSecret}\n" }
            'api-key-secret' { 'AIzaSYNTHETIC_KEY_ONLY_1234567890' }
            'long-secret' { 'x' * 257 }
            default { '${clientSecret}' }
        }
    }
    return (ConvertTo-SecureString -String $value -AsPlainText -Force)
}
if ($Case -eq 'status-no-decrypt') {
    function ConvertTo-SecureString { throw 'FIXTURE_STATUS_MUST_NOT_DECRYPT' }
    function ConvertFrom-SecureString { throw 'FIXTURE_STATUS_MUST_NOT_ENCRYPT' }
}
& (Join-Path $PSScriptRoot 'scripts/drive-local.ps1') -Action $Action
exit $LASTEXITCODE
`;

interface Fixture { directory: string; config: string; privateDirectory: string; temporaryDirectory: string }
async function fixture(): Promise<Fixture> {
  const fixtureParent = join(root, '.tmp');
  await mkdir(fixtureParent, { recursive: true });
  // All helper writes belong to a new synthetic workspace, never the real app's private directory.
  const directory = await mkdtemp(join(fixtureParent, 'drive-local-regression-'));
  await mkdir(join(directory, 'scripts'));
  await copyFile(join(root, 'scripts', 'drive-local.ps1'), join(directory, 'scripts', 'drive-local.ps1'));
  await writeFile(join(directory, 'wrapper.ps1'), wrapper, 'utf8');
  return { directory, config: join(directory, '.tmp', 'drive-private', 'credentials.local'),
    privateDirectory: join(directory, '.tmp', 'drive-private'), temporaryDirectory: join(directory, '.tmp') };
}
function run(f: Fixture, action = 'Status', scenario = 'valid') {
  const result = spawnSync(shell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', join(f.directory, 'wrapper.ps1'), '-Action', action, '-Case', scenario],
  { cwd: f.directory, env: shellEnvironment, encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 32768 });
  assert.equal(result.error, undefined, 'synthetic helper subprocess completed within its deadline');
  assert.equal(result.signal, null);
  assert(!`${result.stdout}${result.stderr}`.includes(clientId), 'client ID stays out of output');
  assert(!`${result.stdout}${result.stderr}`.includes(clientSecret), 'client secret stays out of output');
  assert(!`${result.stdout}${result.stderr}`.includes('encryptedClientSecret'), 'ciphertext fields stay out of output');
  assert(!`${result.stdout}${result.stderr}`.includes('encryptedVaultKey'), 'vault ciphertext stays out of output');
  return result;
}
function failure(result: ReturnType<typeof run>, code: string) {
  assert.equal(result.status, 1);
  assert.equal(result.stdout.trim(), '');
  assert.equal(result.stderr.trim(), `${code}: local setup stopped safely.`);
}
async function syntheticProbe(f: Fixture, code: string) {
  const probeFile = join(f.directory, 'probe.ps1');
  await writeFile(probeFile, `$ErrorActionPreference = 'Stop'\n${code}\n`, 'utf8');
  const result = spawnSync(shell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', probeFile],
    { cwd: f.directory, env: shellEnvironment, encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 32768 });
  // Do not include captured private payloads or raw exception messages in assertions.
  assert.equal(result.status, 0, 'synthetic fixture preparation/verification succeeded');
  assert.equal(result.stdout.trim(), 'FIXTURE_OK');
  assert.equal(result.stderr.trim(), '');
}

test('Drive local helper exposes Status/Configure only and contains no network, process or credential deletion actions', async () => {
  const source = await readFile(join(root, 'scripts', 'drive-local.ps1'), 'utf8');
  for (const forbidden of ['Invoke-WebRequest', 'Invoke-RestMethod', 'Start-Process', 'ProcessStartInfo',
    '[Diagnostics.Process]', 'Remove-Item', '[IO.File]::Delete', 'SetEnvironmentVariable', '$env:GOOGLE_CLIENT_SECRET', 'OPENAI_API_KEY']) {
    assert(!source.includes(forbidden), `helper excludes ${forbidden}`);
  }
  assert(source.includes("$Action -cnotin @('Status', 'Configure')"));
  assert(source.includes('[IO.FileMode]::CreateNew'));
  assert(source.includes('[IO.File]::Move($taskPendingPath, $taskConfigPath)'));
  assert(source.includes('[Security.Cryptography.RandomNumberGenerator]::Create()'));
});

test('default Status reports absence with the fixed callback and never prompts or creates storage', windows, async () => {
  const f = await fixture();
  const result = run(f, 'Status', 'no-read');
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), { encryptedLocalConfigurationPresent: false, clientIdPresent: false,
    clientSecretPresent: false, vaultKeyPresent: false, callbackUri, oauthVerifiedByThisTool: false });
  await assert.rejects(readFile(f.config), { code: 'ENOENT' });
});

test('Windows PowerShell 5.1 th-TH Configure privately stores DPAPI credentials and a canonical random 32-byte vault key', windows, async () => {
  const f = await fixture();
  const result = run(f, 'Configure');
  assert.equal(result.status, 0, `Configure succeeds on synthetic inputs (${result.stderr.trim()})`);
  assert.deepEqual(JSON.parse(result.stdout), { configured: true, encryptedForCurrentWindowsUser: true,
    backendOnly: true, callbackUri, oauthVerifiedByThisTool: false });
  const payload = JSON.parse(await readFile(f.config, 'utf8'));
  assert.deepEqual(Object.keys(payload).sort(), ['callbackUri', 'clientId', 'encryptedClientSecret', 'encryptedVaultKey', 'schema']);
  assert.equal(payload.schema, 1); assert.equal(payload.callbackUri, callbackUri); assert.equal(payload.clientId, clientId);
  assert(!JSON.stringify(payload).includes(clientSecret));
  await syntheticProbe(f, `
$stored = Get-Content -LiteralPath (Join-Path $PSScriptRoot '.tmp/drive-private/credentials.local') -Raw | ConvertFrom-Json
$secret = ConvertTo-SecureString -String $stored.encryptedClientSecret
$vault = ConvertTo-SecureString -String $stored.encryptedVaultKey
try {
    if ([Net.NetworkCredential]::new('', $secret).Password -cne '${clientSecret}') { throw 'FIXTURE_BAD_SECRET' }
    $key = [Net.NetworkCredential]::new('', $vault).Password
    $bytes = [Convert]::FromBase64String($key)
    if ($bytes.Length -ne 32 -or [Convert]::ToBase64String($bytes) -cne $key -or @($bytes | Where-Object { $_ -ne 0 }).Count -eq 0) { throw 'FIXTURE_BAD_VAULT' }
} finally { $secret.Dispose(); $vault.Dispose(); $key = $null; [Array]::Clear($bytes, 0, $bytes.Length) }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
foreach ($relative in @('.tmp', '.tmp/drive-private', '.tmp/drive-private/credentials.local')) {
    $acl = Get-Acl -LiteralPath (Join-Path $PSScriptRoot $relative)
    $rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
    if (-not $acl.AreAccessRulesProtected -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $identity.Value -or
        $rules.Count -ne 1 -or $rules[0].IsInherited -or $rules[0].AccessControlType -ne 'Allow' -or $rules[0].IdentityReference.Value -ne $identity.Value -or
        ($rules[0].FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne [Security.AccessControl.FileSystemRights]::FullControl) { throw 'FIXTURE_BAD_ACL' }
}
Write-Output 'FIXTURE_OK'
`);
  const previous = await readFile(f.config);
  failure(run(f, 'Configure', 'no-read'), 'PRIVATE_CONFIGURATION_ALREADY_EXISTS');
  const status = run(f, 'Status', 'status-no-decrypt');
  assert.equal(status.status, 0);
  assert.deepEqual(JSON.parse(status.stdout), { encryptedLocalConfigurationPresent: true, clientIdPresent: true,
    clientSecretPresent: true, vaultKeyPresent: true, callbackUri, oauthVerifiedByThisTool: false });
  assert.deepEqual(await readFile(f.config), previous, 'Status and reconfigure preserve the same vault key bytes');
});

test('unknown actions fail with safe codes before any prompt or storage write', windows, async () => {
  const f = await fixture();
  for (const action of ['Start', 'Load', 'Rotate', 'Delete', 'configure', 'Status-secret']) failure(run(f, action, 'no-read'), 'INVALID_ACTION');
  await assert.rejects(readFile(f.config), { code: 'ENOENT' });
});

test('invalid IDs and secrets fail before private storage is created without leaking input', windows, async () => {
  const f = await fixture();
  for (const scenario of ['bad-id', 'newline-id', 'long-id']) failure(run(f, 'Configure', scenario), 'GOOGLE_CLIENT_ID_INVALID');
  for (const scenario of ['short-secret', 'whitespace-secret', 'newline-secret', 'api-key-secret', 'long-secret']) {
    failure(run(f, 'Configure', scenario), 'GOOGLE_CLIENT_SECRET_INVALID');
  }
  await assert.rejects(readFile(f.config), { code: 'ENOENT' });
});

test('existing unsafe parent and incomplete private directories fail closed without repairing ACLs', windows, async () => {
  const f = await fixture();
  await mkdir(f.temporaryDirectory);
  await syntheticProbe(f, `$acl = Get-Acl -LiteralPath (Join-Path $PSScriptRoot '.tmp')
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'original-acl.txt'), $acl.Sddl)
Write-Output 'FIXTURE_OK'`);
  failure(run(f), 'PRIVATE_ACL_UNSAFE'); failure(run(f, 'Configure', 'no-read'), 'PRIVATE_ACL_UNSAFE');
  await syntheticProbe(f, `if ((Get-Acl -LiteralPath (Join-Path $PSScriptRoot '.tmp')).Sddl -cne
    [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'original-acl.txt'))) { throw 'FIXTURE_ACL_CHANGED' }
Write-Output 'FIXTURE_OK'`);
  const incomplete = await fixture();
  assert.equal(run(incomplete, 'Configure').status, 0);
  // Only a synthetic credential is relocated; the helper has no delete/move action.
  await syntheticProbe(incomplete, `[IO.File]::Move((Join-Path $PSScriptRoot '.tmp/drive-private/credentials.local'), (Join-Path $PSScriptRoot 'fixture-original.local'))
$path = Join-Path $PSScriptRoot '.tmp/drive-private'
$acl = [Security.AccessControl.DirectorySecurity]::new()
$acl.SetAccessRuleProtection($false, $true)
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
[IO.Directory]::SetAccessControl($path, $acl)
Write-Output 'FIXTURE_OK'`);
  failure(run(incomplete), 'PRIVATE_ACL_UNSAFE'); failure(run(incomplete, 'Configure', 'no-read'), 'PRIVATE_ACL_UNSAFE');
});

test('Status rejects unsafe file ownership/allow rules/inheritance and ordinary-directory substitutions', windows, async () => {
  for (const alteration of ['foreign-allow', 'unprotected', 'directory']) {
    const f = await fixture(); assert.equal(run(f, 'Configure').status, 0);
    await syntheticProbe(f, alteration === 'directory' ? `
$path = Join-Path $PSScriptRoot '.tmp/drive-private/credentials.local'
[IO.File]::Move($path, (Join-Path $PSScriptRoot 'fixture-original.local'))
[void][IO.Directory]::CreateDirectory($path)
Write-Output 'FIXTURE_OK'` : `
$path = Join-Path $PSScriptRoot '.tmp/drive-private/credentials.local'
$acl = [Security.AccessControl.FileSecurity]::new()
$acl.SetAccessRuleProtection($true, $false)
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'Allow'))
${alteration === 'foreign-allow' ? `$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
    [Security.Principal.SecurityIdentifier]::new('S-1-1-0'), 'Read', 'Allow'))` : '$acl.SetAccessRuleProtection($false, $true)'}
[IO.File]::SetAccessControl($path, $acl)
Write-Output 'FIXTURE_OK'`);
    failure(run(f), alteration === 'directory' ? 'PRIVATE_PATH_UNSAFE' : 'PRIVATE_ACL_UNSAFE');
  }
});

test('Status rejects bounded invalid schemas, callbacks, IDs, extra fields and malformed DPAPI envelopes without decoding', windows, async () => {
  const f = await fixture(); assert.equal(run(f, 'Configure').status, 0);
  const original = JSON.parse(await readFile(f.config, 'utf8'));
  for (const payload of ['not json', '[]', '{}', 'x'.repeat(20001), JSON.stringify({ ...original, schema: '1' }),
    JSON.stringify({ ...original, callbackUri: 'http://localhost:3006/api/integrations/drive/callback' }),
    JSON.stringify({ ...original, clientId: 'private-invalid-id' }), JSON.stringify({ ...original, unexpected: clientSecret }),
    JSON.stringify({ ...original, encryptedClientSecret: 'invalid' }), JSON.stringify({ ...original, encryptedVaultKey: 'invalid' }),
    JSON.stringify(original).replace('"schema":1', '"schema":1,"schema":1')]) {
    await writeFile(f.config, payload, 'utf8');
    const result = run(f, 'Status', 'status-no-decrypt');
    failure(result, 'PRIVATE_CONFIGURATION_INVALID');
  }
});

test('non-directory parents and reparse paths fail before prompts or configuration writes', windows, async () => {
  const fileParent = await fixture(); await writeFile(fileParent.temporaryDirectory, 'synthetic ordinary file', 'utf8');
  failure(run(fileParent, 'Configure', 'no-read'), 'PRIVATE_PATH_UNSAFE');
  for (const relative of ['.tmp', '.tmp/drive-private', '.tmp/drive-private/credentials.local']) {
    const f = await fixture(); assert.equal(run(f, 'Configure').status, 0);
    await syntheticProbe(f, `
$path = Join-Path $PSScriptRoot '${relative}'
if ('${relative}' -eq '.tmp/drive-private/credentials.local') {
    [IO.File]::Move($path, (Join-Path $PSScriptRoot 'fixture-original.local'))
} else { [IO.Directory]::Move($path, (Join-Path $PSScriptRoot 'fixture-original-dir')) }
$target = Join-Path $PSScriptRoot 'fixture-target'
[void][IO.Directory]::CreateDirectory($target)
[void](New-Item -ItemType Junction -Path $path -Target $target)
Write-Output 'FIXTURE_OK'`);
    failure(run(f), 'PRIVATE_PATH_UNSAFE'); failure(run(f, 'Configure', 'no-read'), 'PRIVATE_PATH_UNSAFE');
  }
});
