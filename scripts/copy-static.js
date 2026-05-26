import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'client', 'assets');
const destination = path.join(root, 'client', 'dist', 'assets');

if (!existsSync(source)) process.exit(0);

mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true });
console.log('Copied client static assets into the production build.');
