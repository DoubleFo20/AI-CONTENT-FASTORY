import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const required = [
  'AGENTS.md', 'MASTER_CONTEXT.md', 'PROJECT_STATUS.md', 'ROADMAP.md',
  'TASKS.md', 'HANDOFF.md', 'CHANGELOG.md', 'ANTIGRAVITY_HANDOFF.md',
  'docs/PRD.md', 'docs/INFORMATION_ARCHITECTURE.md', 'docs/SYSTEM_ARCHITECTURE.md',
  'docs/UX_FLOW.md', 'docs/DESIGN_SYSTEM.md', 'docs/AI_PIPELINE.md',
  'docs/I18N.md', 'docs/SECURITY.md', 'docs/API_CONTRACT.md',
];
const errors = [];
for (const file of required) {
  if (!existsSync(file)) {
    errors.push(`Missing ${file}`);
    continue;
  }
  const text = readFileSync(file, 'utf8');
  if (text.trim().length < 150) errors.push(`Incomplete ${file}`);
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^(https?:|#)/.test(target)) continue;
    if (!existsSync(resolve(file, '..', target.split('#')[0]))) {
      errors.push(`Broken link in ${file}: ${target}`);
    }
  }
}
const handoff = readFileSync('ANTIGRAVITY_HANDOFF.md', 'utf8');
for (const section of ['READY_FOR_DESIGN', 'target users', 'page inventory', 'TH/EN', 'mobile', 'Technical constraints']) {
  if (!handoff.includes(section)) errors.push(`Handoff missing ${section}`);
}
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log(`Phase 0 document validation passed (${required.length} artifacts).`);
}
