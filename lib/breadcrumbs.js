// Pure breadcrumb model: maps the current route to the trail rendered under
// the top menu. Each crumb is { label, href } for navigable ancestors,
// { label, current: true } for the page being viewed, or a plain { label }
// when the only sensible link target would be the page itself (crumbs never
// self-link). Routes that are not a user listing or repository report get no
// trail (empty array), so landing and static content pages stay crumb-free.
import { classifyRoute, buildReportUrl, getQueryParam } from './routes.js';

// CustomEvent dispatched by ReportView once the report fetch resolves the
// branch actually loaded (a `main` 404 falls back to `master`). Breadcrumbs
// listens and relabels the current crumb so it identifies the report being
// displayed instead of the default guess.
export const BRANCH_RESOLVED_EVENT = 'rf:branch-resolved';

/**
 * Creates a branch-resolution event in the dispatch target's realm.
 * Falls back to an Event carrying detail when CustomEvent is unavailable or
 * incompatible with Event in the current runtime.
 *
 * @param {EventTarget} target - Window, DOM node, or standalone event target.
 * @param {{username: string, repository: string, branch: string}} detail
 *   The report identity and resolved branch carried by the event.
 * @returns {Event & {detail: object}} An event compatible with the target.
 */
function branchResolvedEvent(target, detail) {
  const realm =
    (target && target.window === target && target) || // a Window
    target?.ownerDocument?.defaultView || //             a DOM Node
    null;
  if (realm && typeof realm.CustomEvent === 'function') {
    return new realm.CustomEvent(BRANCH_RESOLVED_EVENT, { detail });
  }
  if (typeof CustomEvent === 'function' && new CustomEvent('') instanceof Event) {
    return new CustomEvent(BRANCH_RESOLVED_EVENT, { detail });
  }
  return Object.assign(new Event(BRANCH_RESOLVED_EVENT), { detail });
}

/**
 * Builds a user-listing path with the username encoded as one URL segment.
 *
 * @param {string} username - Repository owner's username.
 * @returns {string} The user-listing path, without a deployment base path.
 */
function userHref(username) {
  return `/${encodeURIComponent(username)}`;
}

/**
 * Announces the branch a report fetch actually resolved to.
 *
 * @param {EventTarget} target - Dispatch target (window in the browser).
 * @param {{username: string, repository: string, branch: string}} report
 *   The report identity plus its resolved branch.
 */
export function announceResolvedBranch(target, { username, repository, branch }) {
  target.dispatchEvent(
    branchResolvedEvent(target, { username, repository, branch })
  );
}

/**
 * Checks whether a branch-resolution announcement belongs to the report
 * route currently being viewed (stale announcements from a previous page
 * must not relabel it).
 *
 * @param {string} path - Current pathname.
 * @param {{username?: string, repository?: string}} detail - Event detail.
 * @returns {boolean} True when the announcement matches the viewed report.
 */
export function reportMatchesFor(path, detail = {}) {
  const route = classifyRoute(path);
  return route.type === 'report'
    && route.username === detail.username
    && route.repository === detail.repository;
}

/**
 * Builds the breadcrumb trail for a path.
 *
 * @param {string} path - Current pathname (basePath already stripped by Next).
 * @param {string} [search] - Query string conveying ?branch= on deep links.
 * @param {string|null} [resolvedBranch] - Branch the report actually loaded
 *   from (announced by ReportView after the fetch; null beforehand).
 * @returns {Array<{label: string, href?: string, current?: boolean}>} Crumbs
 *   in hierarchical order; the last crumb is the current page.
 */
export function breadcrumbsFor(path, search = '', resolvedBranch = null) {
  const route = classifyRoute(path);

  if (route.type === 'user') {
    return [
      { label: 'Home', href: '/' },
      { label: route.username, current: true }
    ];
  }

  if (route.type === 'report') {
    const hasBranchSegment = path.split('/').filter(Boolean).length > 2;
    const explicitBranch = hasBranchSegment
      ? route.branch
      : getQueryParam(search, 'branch');
    // The resolved branch outranks any explicit/requested branch: when main
    // 404s and the fallback loads master, the label must say "master".
    const branch = resolvedBranch || explicitBranch || null;

    const crumbs = [
      { label: 'Home', href: '/' },
      { label: route.username, href: userHref(route.username) }
    ];

    if (!branch) {
      // Plain /user/repo before the report announces its branch: the
      // repository crumb IS the current page (linking it would self-link),
      // and the branch is not guessed — main may resolve to master.
      crumbs.push({ label: route.repository, current: true });
      return crumbs;
    }

    // With an explicit branch (path segment or ?branch=), the repository
    // crumb navigates back up to the default-branch report. Without one the
    // only target would be the current page, so the crumb stays unlinked.
    crumbs.push(
      explicitBranch
        ? { label: route.repository, href: buildReportUrl(route.username, route.repository) }
        : { label: route.repository },
      { label: branch, current: true }
    );
    return crumbs;
  }

  return [];
}
