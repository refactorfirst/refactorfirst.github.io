import { describe, it, expect } from 'bun:test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadListedRepositories, listUsernames } from '../../lib/repositories.js';

describe('loadListedRepositories', () => {
  it('parses the repositories.txt listing from disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rf-repos-'));
    const file = join(dir, 'repositories.txt');
    writeFileSync(file, 'alice/one\n\n# comment\nalice/two\nbob/three\n');
    expect(loadListedRepositories(file)).toEqual([
      { username: 'alice', repository: 'one', fullName: 'alice/one' },
      { username: 'alice', repository: 'two', fullName: 'alice/two' },
      { username: 'bob', repository: 'three', fullName: 'bob/three' }
    ]);
  });

  it('returns an empty list when the file is missing', () => {
    // Unique temp directory so a stray same-named file can never exist.
    const dir = mkdtempSync(join(tmpdir(), 'rf-repos-missing-'));
    expect(loadListedRepositories(join(dir, 'does-not-exist.txt'))).toEqual([]);
  });

  it('reads the repository root listing by default', () => {
    const repos = loadListedRepositories();
    expect(repos.some(r => r.fullName === 'refactorfirst/refactorfirst')).toBe(true);
  });
});

describe('listUsernames', () => {
  it('returns unique usernames in listing order', () => {
    expect(listUsernames([
      { username: 'alice' }, { username: 'bob' }, { username: 'alice' }
    ])).toEqual(['alice', 'bob']);
  });
});
