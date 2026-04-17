// Optional local hook setup.
// CI remains the authoritative verification path for this repository.

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync, chmodSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const huskyDir = dirname(__filename);
const preCommitPath = resolve(huskyDir, 'pre-commit');

if (existsSync(preCommitPath)) {
  chmodSync(preCommitPath, '755');
}

console.log('Husky hook files are ready.');
