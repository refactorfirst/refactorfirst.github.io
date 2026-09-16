// Post-build CSP hardening for the Next.js static export.
//
// Next exports inline bootstrap scripts (`self.__next_f.push(...)`) into every
// HTML page. Static hosts cannot supply per-request nonces, so this script
// computes sha256 hashes of every inline <script> in out/**/*.html and adds
// them to the Content-Security-Policy <meta> of each file. This keeps the
// strict CSP (no 'unsafe-inline') while allowing Next hydration to run.
//
// Usage: node scripts/fix-csp-hashes.mjs [outDir]   (default: out)

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2] || 'out';

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* htmlFiles(full);
    } else if (entry.endsWith('.html')) {
      yield full;
    }
  }
}

function inlineScriptHashes(html) {
  const hashes = [];
  const pattern = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const body = match[1];
    if (!body.trim()) continue;
    hashes.push(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }
  return hashes;
}

let updated = 0;
for (const file of htmlFiles(outDir)) {
  const html = readFileSync(file, 'utf8');
  const hashes = inlineScriptHashes(html);
  if (hashes.length === 0) continue;

  const metaPattern = /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")/i;
  const meta = html.match(metaPattern);
  if (!meta) {
    console.warn(`warning: no CSP meta found in ${file}; hashes not injected`);
    continue;
  }
  if (hashes.every(hash => meta[2].includes(hash))) continue; // idempotent

  const patchedContent = meta[2].replace(
    /script-src\s/,
    `script-src ${hashes.join(' ')} `
  );
  writeFileSync(file, html.replace(metaPattern, `$1${patchedContent}$3`));
  updated++;
}

console.log(`fix-csp-hashes: patched ${updated} HTML file(s) in ${outDir}`);
