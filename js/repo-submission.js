// Repository submission: form validation, access checks and
// triggering the add-repository GitHub Actions workflow.

import { isValidGitHubName } from './router.js';

const GITHUB_API = 'https://api.github.com';
const GITHUB_RAW = 'https://raw.githubusercontent.com';
const DEFAULT_DISPATCH_REPO = 'refactorfirst/refactorfirst.github.io';
const REPORT_PATH = '.refactorfirst/refactor-first.json';

export const REPORT_MISSING_MESSAGE =
  'The repository specified must have a .refactorfirst/refactor-first.json file present.';

export function validateRepositoryInput(owner, repo) {
  const errors = [];
  if (!owner || !String(owner).trim()) {
    errors.push('User/organization (owner) name is required');
  } else if (!isValidGitHubName(owner.trim())) {
    errors.push('Invalid owner name: only letters, numbers, dashes, dots and underscores are allowed');
  }
  if (!repo || !String(repo).trim()) {
    errors.push('Repository name is required');
  } else if (!isValidGitHubName(repo.trim())) {
    errors.push('Invalid repository name: only letters, numbers, dashes, dots and underscores are allowed');
  }
  return { valid: errors.length === 0, errors };
}

// Verify the authenticated user has write/admin access to owner/repo.
export async function checkRepositoryAccess(owner, repo, username, token) {
  const response = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/collaborators/${username}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json'
      }
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      return { granted: false, reason: 'Repository not found or you do not have access to it' };
    }
    if (response.status === 403) {
      return { granted: false, reason: 'GitHub API rate limit or permission error' };
    }
    return { granted: false, reason: `GitHub API error: ${response.status}` };
  }

  const data = await response.json();
  if (data.permission === 'write' || data.permission === 'admin') {
    return { granted: true };
  }
  return { granted: false, reason: 'You need write access to submit this repository' };
}

// Check whether the repository has a .refactorfirst/refactor-first.json file.
// Tries the main branch first, then the repository's default branch.
export async function checkReportExists(owner, repo, token) {
  const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json'
    }
  });
  if (!response.ok) {
    return { exists: false, message: 'Repository not found or inaccessible' };
  }

  const { default_branch: defaultBranch = 'main' } = await response.json();
  const branchesToTry = [...new Set(['main', defaultBranch])];

  for (const branch of branchesToTry) {
    const rawResponse = await fetch(`${GITHUB_RAW}/${owner}/${repo}/${branch}/${REPORT_PATH}`, {
      method: 'HEAD'
    });
    if (rawResponse.ok) {
      return { exists: true, branch };
    }
  }

  return { exists: false, message: REPORT_MISSING_MESSAGE };
}

// Trigger the add-repository workflow in the listing repository.
export async function triggerAddRepositoryWorkflow({
  owner, repo, submittedBy, token,
  dispatchRepo = DEFAULT_DISPATCH_REPO
}) {
  const response = await fetch(`${GITHUB_API}/repos/${dispatchRepo}/dispatches`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json'
    },
    body: JSON.stringify({
      event_type: 'add-repository',
      client_payload: { owner, repo, submitted_by: submittedBy }
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to trigger repository validation workflow (HTTP ${response.status})`);
  }
}

// Full submission flow: validate input, check access, verify the report
// exists, then trigger the validation workflow.
export async function submitRepository({ owner, repo }, submittedBy, token, options = {}) {
  const validation = validateRepositoryInput(owner, repo);
  if (!validation.valid) {
    return { success: false, message: validation.errors.join('. ') + ' - required fields must be valid' };
  }

  const cleanOwner = owner.trim();
  const cleanRepo = repo.trim();

  try {
    const access = await checkRepositoryAccess(cleanOwner, cleanRepo, submittedBy, token);
    if (!access.granted) {
      return { success: false, message: access.reason };
    }
    const report = await checkReportExists(cleanOwner, cleanRepo, token);
    if (!report.exists) {
      return { success: false, message: report.message };
    }
    await triggerAddRepositoryWorkflow({
      owner: cleanOwner, repo: cleanRepo, submittedBy, token,
      dispatchRepo: options.dispatchRepo || DEFAULT_DISPATCH_REPO
    });
    return {
      success: true,
      message: 'Repository submitted for validation. It will appear in the listing within ~10 minutes.'
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
}
