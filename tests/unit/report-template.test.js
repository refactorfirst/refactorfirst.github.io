// Report template layout invariants: report pages must use the available
// width (95% of the view) instead of a fixed pixel cap for chart areas.
import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function loadTemplate(which) {
  return readFileSync(
    path.join(
      import.meta.dir, '../../',
      which === 'assets' ? 'assets/refactor-first-report.mustache' : 'public/assets/refactor-first-report.mustache'
    ),
    'utf8'
  );
}

describe('bundled report template', () => {
  it('chart areas use 95% width instead of a fixed pixel limit', () => {
    const template = loadTemplate('assets');
    expect(template).not.toContain('width: 1100px');
    expect(template).not.toContain('max-width: 1100px');
    expect(template).toContain('width: 95%');
  });

  it('the served public/ copy is identical to the source template', () => {
    expect(loadTemplate('public')).toBe(loadTemplate('assets'));
  });
});
