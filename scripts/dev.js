// Ishlab chiqish rejimi: backend (watch) va Vite dev serverni birga ishga tushiradi.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const procs = [
  spawn(process.execPath, ['--watch', 'server/index.js'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  }),
  spawn(npm, ['--prefix', 'web', 'run', 'dev'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }),
];

const stopAll = () => procs.forEach((p) => !p.killed && p.kill());
process.on('SIGINT', () => { stopAll(); process.exit(0); });
process.on('SIGTERM', () => { stopAll(); process.exit(0); });
procs.forEach((p) => p.on('exit', (code) => { stopAll(); process.exit(code ?? 0); }));
