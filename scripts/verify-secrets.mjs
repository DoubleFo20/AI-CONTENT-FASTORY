import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const patterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /sk-proj-[A-Za-z0-9_-]{24,}/,
  /sb_secret_[A-Za-z0-9_-]{24,}/, /GOCSPX-[A-Za-z0-9_-]{16,}/];
const knownKeys = ['OPENAI_API_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'GOOGLE_CLIENT_SECRET', 'ACF_TOKEN_ENCRYPTION_KEY'].map(name => process.env[name]).filter(value => value && value.length > 16);
const failures = [];
for (const file of files) {
  if (/(^|\/)\.env(?:\.|$)|\.(?:pem|key|p12|pfx|sqlite|db)$/.test(file)) {
    failures.push(file);
    continue;
  }
  const text = readFileSync(file, 'utf8');
  if (patterns.some((pattern) => pattern.test(text)) || knownKeys.some(value => text.includes(value))) {
    failures.push(file);
  }
}
const candidates = ['.env', '.env.local', 'storage/app.sqlite', 'storage/clip.mp4', '.worktrees/core/file', '.tmp/test/file'];
const ignored = execFileSync('git', ['check-ignore', '--stdin'], { input: candidates.join('\n'), encoding: 'utf8' }).trim().split(/\r?\n/);
for (const candidate of candidates) if (!ignored.includes(candidate)) failures.push(`Unprotected path: ${candidate}`);
if (failures.length) {
  console.error('Secret/ignore validation failed in paths:', failures.join(', '));
  process.exitCode = 1;
} else {
  console.log(`Secret/ignore validation passed (${files.length} tracked files; no secret values printed).`);
}
