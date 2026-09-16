// Copies build inputs whose source of truth lives in the repo root into
// public/ so the static export serves them. Runs as the `prebuild` step
// before `next build`.
import { copyFileSync, existsSync } from 'node:fs';

if (existsSync('repositories.txt')) {
  copyFileSync('repositories.txt', 'public/repositories.txt');
  console.log('sync-repositories: repositories.txt -> public/repositories.txt');
}

// The bundled Mustache template is the authoritative report template
// (repository-provided templates are never fetched) — keep the served copy
// in sync with the source.
if (existsSync('assets/refactor-first-report.mustache')) {
  copyFileSync('assets/refactor-first-report.mustache',
    'public/assets/refactor-first-report.mustache');
  console.log('sync-repositories: assets/refactor-first-report.mustache -> public/assets/');
}
