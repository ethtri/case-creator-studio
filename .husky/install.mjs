// Husky install script
// This ensures husky is set up correctly

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync, mkdirSync, chmodSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const huskyDir = resolve(__dirname, '.husky');

if (!existsSync(huskyDir)) {
  mkdirSync(huskyDir, { recursive: true });
}

// Make pre-commit executable
const preCommitPath = resolve(huskyDir, 'pre-commit');
if (existsSync(preCommitPath)) {
  chmodSync(preCommitPath, '755');
}

console.log('✅ Husky is set up!');

