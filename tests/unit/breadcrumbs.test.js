import { describe, it, expect } from 'bun:test';
import {
  breadcrumbsFor,
  reportMatchesFor,
  BRANCH_RESOLVED_EVENT,
  announceResolvedBranch
} from '../../lib/breadcrumbs.js';

// Pure breadcrumb model for the trail rendered under the top menu. A crumb is
// { label, href } for navigable ancestors and { label, current: true } for
// the page being viewed; a plain { label } crumb carries no link (used when
// the only sensible target would be the current page — never self-link).
// An empty list means "no breadcrumbs on this route".
describe('breadcrumbsFor', () => {
  it('returns no crumbs for the landing page', () => {
    expect(breadcrumbsFor('/')).toEqual([]);
  });

  it('returns no crumbs for static content pages', () => {
    for (const path of ['/about', '/getting-started', '/faq', '/add-repo']) {
      expect(breadcrumbsFor(path), path).toEqual([]);
    }
  });

  it('returns no crumbs for invalid (not-found) paths', () => {
    expect(breadcrumbsFor('/..')).toEqual([]);
    expect(breadcrumbsFor('/alice/repo/main/extra')).toEqual([]);
  });

  it('marks the username as current on the user listing page', () => {
    expect(breadcrumbsFor('/alice')).toEqual([
      { label: 'Home', href: '/' },
      { label: 'alice', current: true }
    ]);
  });

  it('marks the repository as current on the default report route (no self-link before the branch is known)', () => {
    // /alice/some-repo has no explicit branch; the repo crumb must NOT link
    // back to this same pathname, and the branch is not guessed ("main" may
    // fall back to master once the report is fetched).
    expect(breadcrumbsFor('/alice/some-repo')).toEqual([
      { label: 'Home', href: '/' },
      { label: 'alice', href: '/alice' },
      { label: 'some-repo', current: true }
    ]);
  });

  it('appends the resolved branch once the report load announces it', () => {
    expect(breadcrumbsFor('/alice/some-repo', '', 'main')).toEqual([
      { label: 'Home', href: '/' },
      { label: 'alice', href: '/alice' },
      { label: 'some-repo' },
      { label: 'main', current: true }
    ]);
  });

  it('labels the current crumb with the resolved branch, not the default guess', () => {
    const crumbs = breadcrumbsFor('/alice/some-repo', '', 'master');
    expect(crumbs.at(-1)).toEqual({ label: 'master', current: true });
    // There is nowhere "up" from the repository level on this route, so the
    // repository crumb stays unlinked instead of self-linking to /alice/some-repo.
    expect(crumbs[2]).toEqual({ label: 'some-repo' });
  });

  it('uses the branch path segment for branch-pinned reports', () => {
    expect(breadcrumbsFor('/alice/some-repo/master')).toEqual([
      { label: 'Home', href: '/' },
      { label: 'alice', href: '/alice' },
      { label: 'some-repo', href: '/alice/some-repo' },
      { label: 'master', current: true }
    ]);
  });

  it('relabels a path-pinned default branch when the fetch resolves to the fallback', () => {
    // /alice/some-repo/main requested main, but main 404'd and the report
    // loaded from master — the label must identify the displayed report.
    const crumbs = breadcrumbsFor('/alice/some-repo/main', '', 'master');
    expect(crumbs.at(-1)).toEqual({ label: 'master', current: true });
    // The repo crumb still navigates back up to the default report.
    expect(crumbs[2]).toEqual({ label: 'some-repo', href: '/alice/some-repo' });
  });

  it('prefers the ?branch= query parameter over the main default (deep links)', () => {
    const crumbs = breadcrumbsFor('/alice/some-repo', '?branch=develop');
    expect(crumbs).toEqual([
      { label: 'Home', href: '/' },
      { label: 'alice', href: '/alice' },
      { label: 'some-repo', href: '/alice/some-repo' },
      { label: 'develop', current: true }
    ]);
  });

  it('ignores the ?branch= parameter when the path pins a branch', () => {
    const crumbs = breadcrumbsFor('/alice/some-repo/master', '?branch=develop');
    expect(crumbs.at(-1)).toEqual({ label: 'master', current: true });
  });

  it('keeps valid dotted/underscored names intact in crumb hrefs', () => {
    const crumbs = breadcrumbsFor('/Alice.Co/re_po.js', '?branch=main');
    expect(crumbs[1].href).toBe('/Alice.Co');
    expect(crumbs[2].href).toBe('/Alice.Co/re_po.js');
  });

  it('treats an empty ?branch= as no explicit branch', () => {
    expect(breadcrumbsFor('/alice/some-repo', '?branch=').at(-1))
      .toEqual({ label: 'some-repo', current: true });
  });
});

describe('reportMatchesFor', () => {
  it('matches an announcement to the report route being viewed', () => {
    expect(reportMatchesFor('/alice/some-repo', { username: 'alice', repository: 'some-repo' })).toBe(true);
    expect(reportMatchesFor('/alice/some-repo/master', { username: 'alice', repository: 'some-repo' })).toBe(true);
  });

  it('rejects announcements for other repositories or non-report routes', () => {
    expect(reportMatchesFor('/alice/some-repo', { username: 'alice', repository: 'other-repo' })).toBe(false);
    expect(reportMatchesFor('/alice/other-repo', { username: 'alice', repository: 'some-repo' })).toBe(false);
    expect(reportMatchesFor('/alice', { username: 'alice', repository: 'some-repo' })).toBe(false);
    expect(reportMatchesFor('/about', { username: 'alice', repository: 'some-repo' })).toBe(false);
    expect(reportMatchesFor('/alice/some-repo', { username: 'alice' })).toBe(false);
  });
});

describe('announceResolvedBranch', () => {
  it('dispatches a CustomEvent carrying the report identity and resolved branch', () => {
    const target = new EventTarget();
    const seen = [];
    target.addEventListener(BRANCH_RESOLVED_EVENT, event => seen.push(event.detail));
    announceResolvedBranch(target, { username: 'alice', repository: 'some-repo', branch: 'master' });
    expect(seen).toEqual([{ username: 'alice', repository: 'some-repo', branch: 'master' }]);
  });

  it('uses a namespaced event name', () => {
    expect(BRANCH_RESOLVED_EVENT).toBe('rf:branch-resolved');
  });
});
