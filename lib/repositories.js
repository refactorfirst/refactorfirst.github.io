// Server-side (RSC/build-time) repository listing loader. Reads the
// repositories.txt source of truth from the repository root; the file is
// also mirrored into public/ at build time for client-side consumers.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseRepositories } from './search.js';

const DEFAULT_PATH = 'repositories.txt';

export function loadListedRepositories(filePath = path.join(process.cwd(), DEFAULT_PATH)) {
  let text = '';
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  return parseRepositories(text);
}

// Unique usernames in listing order.
export function listUsernames(repositories) {
  return [...new Set(repositories.map(repo => repo.username))];
}
