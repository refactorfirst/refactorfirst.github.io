// Report fetching, platform-aware raw URL builders and retry/fallback logic.
// A deployment serves repositories hosted on its own platform (GitHub,
// GitLab or Bitbucket); URL construction depends on that environment.

const REPORT_PATH = '.refactorfirst/refactor-first.json';

const PLATFORM_BUILDERS = {
  github: {
    raw: (user, repo, branch, path) =>
      `https://raw.githubusercontent.com/${user}/${repo}/refs/heads/${branch}/${path}`
  },
  gitlab: {
    defaultBase: 'https://gitlab.com',
    raw: (user, repo, branch, path, base) =>
      `${base}/${user}/${repo}/-/raw/${branch}/${path}`
  },
  bitbucket: {
    raw: (user, repo, branch, path) =>
      `https://bitbucket.org/${user}/${repo}/raw/${branch}/${path}`
  }
};

function platformConfig({ environment = 'github', baseUrl } = {}) {
  const config = PLATFORM_BUILDERS[environment] || PLATFORM_BUILDERS.github;
  const base = String(baseUrl || config.defaultBase || '').replace(/\/+$/, '');
  return { buildRaw: config.raw, base };
}

export function constructRawUrl(username, repository, branch, options = {}) {
  const { buildRaw, base } = platformConfig(options);
  return buildRaw(username, repository, branch, REPORT_PATH, base);
}

export async function fetchJson(username, repository, branch, options = {}) {
  const url = constructRawUrl(username, repository, branch, options);
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const error = new Error(
      response.status === 404
        ? 'Repository not found'
        : `Failed to fetch: ${response.status} ${response.statusText}`
    );
    error.status = response.status;
    throw error;
  }

  return response.json();
}

// Fetch with retry + exponential backoff for transient network/server errors.
// 4xx responses are returned immediately - retrying them is pointless.
export async function fetchWithRetry(url, options = {}, { retries = 3, baseDelayMs = 250 } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      const response = await fetch(url, options);
      if (!response.ok && response.status >= 500 && attempt < retries) {
        attempt++;
        await new Promise(resolve => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
        continue;
      }
      return response;
    } catch (error) {
      if (attempt >= retries) throw error;
      attempt++;
      await new Promise(resolve => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
    }
  }
}

// Branch fallback: try the requested branch; when the default branch (main)
// returns 404, fall back to master. Other failures (network, rate limits,
// 5xx) are propagated unchanged so they are not masked as "not found".
// Returns { data, branch }.
export async function fetchJsonWithFallback(username, repository, branch = getDefaultBranchName(), options = {}) {
  try {
    return { data: await fetchJson(username, repository, branch, options), branch };
  } catch (error) {
    if (branch === getDefaultBranchName() && error.status === 404) {
      const data = await fetchJson(username, repository, 'master', options);
      return { data, branch: 'master' };
    }
    throw error;
  }
}

function getDefaultBranchName() {
  return 'main';
}

// Fetch the report JSON for a repository, applying branch fallback logic.
// The Mustache template is NOT fetched from the repository: templates are
// untrusted content, so the app always renders with its own bundled
// assets/refactor-first-report.mustache. Repositories only supply data.
export async function fetchReport(username, repository, branch = 'main', options = {}) {
  const { data, branch: resolvedBranch } =
    await fetchJsonWithFallback(username, repository, branch, options);
  return { data, branch: resolvedBranch };
}
