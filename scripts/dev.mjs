import { spawn } from 'node:child_process';

const services = [
  spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'watch', 'server/index.ts'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { stdio: 'inherit' }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const service of services) service.kill();
  process.exitCode = code;
}
for (const service of services) {
  service.on('error', () => stop(1));
  service.on('exit', (code) => stop(code ?? 0));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
