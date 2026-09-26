// Phase 5: dynamic routes — generateStaticParams content from the listing
// and invalid-parameter rejection -> notFound().
//
// NOTE: no lib/repositories mock here — Bun mocks are process-wide and
// would shadow its fs-based unit test. Expectations are computed from the
// real repositories.txt instead; the pure param-mapping logic is covered
// by tests/unit/static-params.test.js.
import { describe, test, expect } from 'bun:test';
import { mock } from 'bun:test';
import { loadListedRepositories, listUsernames } from '../../lib/repositories';

import { sharedNextNavigationMock, notFoundCalls } from './next-navigation-stub';

const listing = loadListedRepositories();

// next/navigation notFound: the shared stub records the call and throws a
// NEXT_NOT_FOUND sentinel so it can be asserted here.
mock.module('next/navigation', () => sharedNextNavigationMock());

const userPage = await import('../../app/[username]/page');
const repoPage = await import('../../app/[username]/[repository]/page');
const branchPage = await import('../../app/[username]/[repository]/[branch]/page');

function asParams(obj) {
  return Promise.resolve(obj);
}

describe('route generateStaticParams', () => {
  test('/{username} emits one entry per listed user', () => {
    const params = userPage.generateStaticParams();
    expect(params.length).toBeGreaterThan(0);
    expect(params).toEqual(listUsernames(listing).map(username => ({ username })));
  });

  test('/{user}/{repo} emits every listed repository', () => {
    const params = repoPage.generateStaticParams();
    expect(params).toEqual(listing.map(({ username, repository }) => ({ username, repository })));
  });

  test('/{user}/{repo}/{branch} emits main and master per repo', () => {
    const params = branchPage.generateStaticParams();
    expect(params).toEqual(listing.flatMap(({ username, repository }) => [
      { username, repository, branch: 'main' },
      { username, repository, branch: 'master' }
    ]));
  });

  test('all dynamic routes disallow runtime params', () => {
    expect(userPage.dynamicParams).toBe(false);
    expect(repoPage.dynamicParams).toBe(false);
    expect(branchPage.dynamicParams).toBe(false);
  });
});

describe('route param validation', () => {
  test('invalid repository segment calls notFound()', async () => {
    notFoundCalls.length = 0;
    await expect(
      repoPage.default({ params: asParams({ username: 'alice', repository: 'not(a-repo)' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundCalls.length).toBe(1);
  });

  test('valid listing renders a page component', async () => {
    const { username, repository } = listing[0];
    const element = await repoPage.default({ params: asParams({ username, repository }) });
    expect(element).toBeTruthy();
  });
});
