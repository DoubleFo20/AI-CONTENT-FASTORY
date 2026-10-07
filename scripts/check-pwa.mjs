import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('dist/web/manifest.webmanifest', 'utf8'));
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, '/');
for (const size of [192, 512]) {
  const icon = manifest.icons.find((item) => item.sizes === `${size}x${size}` && item.type === 'image/png');
  assert.ok(icon, `Missing ${size}px PNG manifest icon`);
  assert.ok(existsSync(`dist/web${icon.src}`));
}
const sw = readFileSync('dist/web/sw.js', 'utf8');
assert.ok(sw.includes("url.pathname.startsWith('/api/')"));
assert.ok(sw.includes("credentials: 'omit'"));
assert.ok(sw.includes('/assets/'));
assert.ok(sw.includes('/offline.html'));
assert.ok(sw.includes("url.origin !== self.location.origin"));
console.log('PWA manifest, public shell assets and private-API exclusion passed.');
