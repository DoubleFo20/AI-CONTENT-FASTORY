import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const assets = readdirSync('dist/web/assets').filter((name) => /\.(js|css|woff2?)$/.test(name)).map((name) => `/assets/${name}`);
const shell = ['/', '/index.html', '/offline.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', ...assets];
const version = createHash('sha256').update(readFileSync('dist/web/index.html')).update(JSON.stringify(shell)).digest('hex').slice(0, 12);
const sw = readFileSync('public/sw.js', 'utf8')
  .replace(/const CACHE = '[^']+';/, `const CACHE = 'content-factory-shell-${version}';`)
  .replace(/const SHELL = \[[^\]]+\];/, `const SHELL = ${JSON.stringify(shell)};`);
writeFileSync('dist/web/sw.js', sw);
console.log(`PWA shell prepared (${shell.length} public assets).`);
