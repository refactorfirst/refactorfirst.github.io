// Shared utility helpers: HTML escaping, sorting and pagination.
// Hosting-environment detection now lives in lib/host.js.

export const REPOSITORIES_PER_PAGE = 50;

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

/**
 * Builds the URL of a report-linked source file from the repository URL and
 * the file path relative to the repository root. Each path segment is
 * percent-encoded (keeping the / separators) so file-name characters such as
 * # or ? stay part of the path instead of turning into URL fragment or
 * query delimiters, and the join tolerates a repository URL without a
 * trailing slash and a path with a leading slash.
 *
 * @param {*} repoUrl - Repository URL prefix from the project metadata.
 * @param {*} path - File or directory path relative to the repository root.
 * @returns {string|null} The combined URL, or null when it cannot be built.
 */
export function sourceUrl(repoUrl, path) {
  if (typeof repoUrl !== 'string' || typeof path !== 'string') return null;
  const base = repoUrl.endsWith('/') ? repoUrl : repoUrl + '/';
  const relative = path.startsWith('/') ? path.slice(1) : path;
  return base + relative.split('/').map(encodeURIComponent).join('/');
}

export function sortByRepository(repositories) {
  return [...repositories].sort((a, b) =>
    a.repository.toLowerCase().localeCompare(b.repository.toLowerCase())
  );
}

export function reposForUser(repositories, username) {
  const normalized = String(username || '').toLowerCase();
  return repositories.filter(repo => repo.username.toLowerCase() === normalized);
}

// Slice a list into pages. Returns the requested page clamped to a valid range.
export function paginate(items, page = 1, perPage = REPOSITORIES_PER_PAGE) {
  const numericPerPage = Number(perPage);
  if (!Number.isInteger(numericPerPage) || numericPerPage < 1) {
    throw new RangeError('perPage must be a positive integer');
  }
  const totalPages = Math.max(1, Math.ceil(items.length / numericPerPage));
  const numericPage = Number.isFinite(Number(page)) ? Number(page) : 1;
  const clamped = Math.min(Math.max(1, Math.trunc(numericPage)), totalPages);
  const start = (clamped - 1) * numericPerPage;
  return {
    items: items.slice(start, start + numericPerPage),
    page: clamped,
    perPage: numericPerPage,
    totalPages,
    totalItems: items.length
  };
}

// Render pagination controls as HTML links (baseUrl without a query string).
export function renderPaginationControls({ page, totalPages, baseUrl }) {
  if (totalPages <= 1) return '';
  const safeBase = escapeHtml(baseUrl);
  const links = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === page) {
      links.push(`<span class="page current" aria-current="page">${p}</span>`);
    } else {
      links.push(`<a class="page" href="${safeBase}?page=${p}">${p}</a>`);
    }
  }
  return `<nav class="pagination" aria-label="Pagination">${links.join('')}</nav>`;
}
