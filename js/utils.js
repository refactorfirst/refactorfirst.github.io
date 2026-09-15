// Shared utility helpers: HTML escaping, sorting and pagination.

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

// Detect which hosting environment the site is deployed to from the hostname,
// so documentation can show the relevant CI sample only.
export function detectHostingEnvironment(hostname, explicitPlatform) {
  // First check for explicit platform setting from deployment metadata
  if (typeof document !== 'undefined') {
    const platformMeta = document.querySelector('meta[name="platform"]');
    if (platformMeta && platformMeta.content) {
      const platform = String(platformMeta.content).toLowerCase();
      if (['github', 'gitlab', 'bitbucket'].includes(platform)) {
        return platform;
      }
    }
  }

  // Check explicit platform parameter (for testing)
  if (explicitPlatform) {
    const platform = String(explicitPlatform).toLowerCase();
    if (['github', 'gitlab', 'bitbucket'].includes(platform)) {
      return platform;
    }
  }

  // Fallback to hostname detection
  const host = String(hostname || '').toLowerCase();
  if (host.endsWith('.gitlab.io') || host.split('.').includes('gitlab')) {
    return 'gitlab';
  }
  if (host.endsWith('.bitbucket.io') || host.split('.').includes('bitbucket')) {
    return 'bitbucket';
  }
  // github.io, github.com, GitHub Enterprise domains and anything else
  return 'github';
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
      links.push(`<a class="page" href="${safeBase}?page=${p}" data-link>${p}</a>`);
    }
  }
  return `<nav class="pagination" aria-label="Pagination">${links.join('')}</nav>`;
}
