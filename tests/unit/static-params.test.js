// generateStaticParams content from fixture data — Phase 5.
import { describe, it, expect } from 'bun:test';
import {
  userStaticParams,
  reportStaticParams,
  branchStaticParams
} from '../../lib/static-params.js';

const fixtures = [
  { username: 'alice', repository: 'one', fullName: 'alice/one' },
  { username: 'alice', repository: 'two', fullName: 'alice/two' },
  { username: 'bob', repository: 'gamma', fullName: 'bob/gamma' }
];

describe('userStaticParams', () => {
  it('contains one entry per distinct username', () => {
    expect(userStaticParams(fixtures)).toEqual([
      { username: 'alice' },
      { username: 'bob' }
    ]);
  });
});

describe('reportStaticParams', () => {
  it('contains every listed (user, repo) pair', () => {
    expect(reportStaticParams(fixtures)).toEqual([
      { username: 'alice', repository: 'one' },
      { username: 'alice', repository: 'two' },
      { username: 'bob', repository: 'gamma' }
    ]);
  });
});

describe('branchStaticParams', () => {
  it('generates main and master for every listed repo', () => {
    expect(branchStaticParams(fixtures)).toEqual([
      { username: 'alice', repository: 'one', branch: 'main' },
      { username: 'alice', repository: 'one', branch: 'master' },
      { username: 'alice', repository: 'two', branch: 'main' },
      { username: 'alice', repository: 'two', branch: 'master' },
      { username: 'bob', repository: 'gamma', branch: 'main' },
      { username: 'bob', repository: 'gamma', branch: 'master' }
    ]);
  });
});
