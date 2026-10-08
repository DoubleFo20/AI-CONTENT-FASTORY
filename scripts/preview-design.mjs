import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Serve only the public, synthetic design reference; never the repository/runtime.
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/studio.css', ['studio.css', 'text/css; charset=utf-8']],
  ['/studio.js', ['studio.js', 'text/javascript; charset=utf-8']],
]);
const root = new URL('../docs/design/', import.meta.url);
const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const asset = assets.get(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
  if (!asset) { response.writeHead(404).end(); return; }
  try {
    const body = await readFile(fileURLToPath(new URL(asset[0], root)));
    response.writeHead(200, {
      'Content-Type': asset[1], 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch { response.writeHead(404).end(); }
});
server.listen(3003, '127.0.0.1', () => console.log('Design reference: http://127.0.0.1:3003'));
server.on('error', () => { console.error('Design preview could not start on port 3003.'); process.exitCode = 1; });
process.once('SIGINT', () => server.close());
process.once('SIGTERM', () => server.close());
