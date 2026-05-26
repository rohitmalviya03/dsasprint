import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const services = [
  { name: 'API', cwd: path.join(root, 'server') },
  { name: 'WEB', cwd: path.join(root, 'client') }
];
const processes = [];
let stopping = false;

for (const service of services) {
  if (!existsSync(path.join(service.cwd, 'node_modules'))) {
    console.log(`[${service.name}] Installing dependencies for first run...`);
    const install = spawnSync(npmCommand, ['install'], {
      cwd: service.cwd,
      shell: process.platform === 'win32',
      stdio: 'inherit'
    });
    if (install.status !== 0) {
      console.error(`[${service.name}] Dependency installation failed.`);
      process.exit(install.status || 1);
    }
  }
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) {
    if (!child.killed) child.kill();
  }
  process.exitCode = exitCode;
}

for (const service of services) {
  console.log(`[${service.name}] Starting...`);
  const child = spawn(npmCommand, ['run', 'dev'], {
    cwd: service.cwd,
    shell: process.platform === 'win32',
    stdio: 'inherit'
  });
  processes.push(child);

  child.on('error', (error) => {
    console.error(`[${service.name}] Could not start: ${error.message}`);
    stop(1);
  });

  child.on('exit', (code, signal) => {
    if (stopping) return;
    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.error(`[${service.name}] Stopped with ${reason}. Closing the application.`);
    stop(code || 1);
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
