import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, get } from 'node:http';
import { shutdownApplication } from '../server/shutdown.js';

test('shutdown cancels background work before draining a stalled HTTP media response and closes afterward', async () => {
  const events: string[] = [];
  let entered!: () => void; const serving = new Promise<void>(resolve => { entered = resolve; });
  const server = createServer((_req, res) => { res.writeHead(200); res.write('synthetic partial media'); entered(); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const request = get(`http://127.0.0.1:${address.port}`, response => { response.resume(); response.on('error', () => undefined); });
  request.on('error', () => undefined); await serving;
  const began = performance.now();
  await shutdownApplication(server, { async stopBackground() { events.push('background'); }, async close() { assert.equal(server.listening, false); events.push('closed'); } }, 30);
  assert.deepEqual(events, ['background', 'closed']); assert.ok(performance.now() - began < 1000);
  request.destroy();
});

test('a background-stop failure still drains HTTP and closes application resources', async () => {
  const server = createServer((_req, res) => res.end());
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  let closed = false;
  await assert.rejects(shutdownApplication(server, { async stopBackground() { throw new Error('synthetic-stop-failure'); }, async close() { closed = true; } }, 30), /synthetic-stop-failure/);
  assert.equal(closed, true); assert.equal(server.listening, false);
});
