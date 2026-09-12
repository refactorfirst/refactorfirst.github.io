export function constructRawUrl(username, repository, branch) {
  return `https://raw.githubusercontent.com/${username}/${repository}/${branch}/.refactorfirst/refactor-first.json`;
}

export function constructTemplateUrl(username, repository, branch) {
  return `https://raw.githubusercontent.com/${username}/${repository}/${branch}/.refactorfirst/refactor-first-report.mustache`;
}

export async function fetchJson(username, repository, branch) {
  const url = constructRawUrl(username, repository, branch);
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Repository not found');
    }
    throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function fetchTemplate(username, repository, branch, fallbackTemplate = null) {
  const url = constructTemplateUrl(username, repository, branch);
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/plain'
      }
    });
    if (!response.ok) {
      if (fallbackTemplate) return fallbackTemplate;
      throw new Error(`Failed to fetch template: ${response.status} ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    if (fallbackTemplate) return fallbackTemplate;
    throw error;
  }
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
// fails, fall back to master. Returns { data, branch }.
export async function fetchJsonWithFallback(username, repository, branch = getDefaultBranchName()) {
  try {
    return { data: await fetchJson(username, repository, branch), branch };
  } catch (error) {
    if (branch === getDefaultBranchName()) {
      const data = await fetchJson(username, repository, 'master');
      return { data, branch: 'master' };
    }
    throw error;
  }
}

function getDefaultBranchName() {
  return 'main';
}

// Fetch both the report JSON and the Mustache template for a repository,
// applying branch fallback logic and the bundled fallback template.
export async function fetchReport(username, repository, branch = 'main', { fallbackTemplate = null } = {}) {
  const { data, branch: resolvedBranch } = await fetchJsonWithFallback(username, repository, branch);
  const template = await fetchTemplate(username, repository, resolvedBranch, fallbackTemplate);
  return { data, template, branch: resolvedBranch };
}