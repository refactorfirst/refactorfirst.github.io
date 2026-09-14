// Repository submission: form validation, unauthenticated report checks and
// pre-filled issue URLs. The platform CI job (GitHub Actions / GitLab CI /
// Bitbucket Pipelines) is the authoritative validator; the submitter's
// verified identity is captured as the author of the created issue.

import { isValidGitHubName } from './router.js';
import { constructRawUrl } from './fetcher.js';

export const DEFAULT_SUBMISSION_TARGET = 'refactorfirst/refactorfirst.github.io';
export const REPORT_MISSING_MESSAGE =
  'The repository specified must have a .refactorfirst/refactor-first.json file present.';

const PLATFORM_LABELS = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket'
};

export function platformLabel(environment) {
  return PLATFORM_LABELS[environment] || PLATFORM_LABELS.github;
}

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

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || 'https://gitlab.com').replace(/\/+$/, '');
}

// Build the pre-filled "new issue" URL for the deployment's platform. The
// issue title carries the submitted repository; the platform captures the
// verified submitter identity as the issue author.
export function buildSubmissionIssueUrl({
  owner, repo,
  environment = 'github',
  target = DEFAULT_SUBMISSION_TARGET,
  baseUrl
}) {
  const title = `Add repository: ${owner}/${repo}`;
  const params = new URLSearchParams();
  if (environment === 'gitlab') {
    params.set('issue[title]', title);
    params.set('issuable_template', 'Add repository');
    return `${normalizeBaseUrl(baseUrl)}/${target}/-/issues/new?${params}`;
  }
  params.set('title', title);
  if (environment === 'bitbucket') {
    return `https://bitbucket.org/${target}/issues/new?${params}`;
  }
  params.set('template', 'add-repo.md');
  return `https://github.com/${target}/issues/new?${params}`;
}

// URL of the platform API endpoint describing the repository/project.
export function repositoryInfoUrl(owner, repo, { environment = 'github', baseUrl } = {}) {
  if (environment === 'gitlab') {
    return `${normalizeBaseUrl(baseUrl)}/api/v4/projects/${encodeURIComponent(`${owner}/${repo}`)}`;
  }
  if (environment === 'bitbucket') {
    return `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}`;
  }
  return `https://api.github.com/repos/${owner}/${repo}`;
}

function extractDefaultBranch(info, environment) {
  if (environment === 'bitbucket') {
    return (info && info.mainbranch && info.mainbranch.name) || 'main';
  }
  return (info && info.default_branch) || 'main';
}

// Check whether the repository has a .refactorfirst/refactor-first.json file.
// Unauthenticated (public repositories only). Tries the main branch, then the
// repository's default branch and finally master.
export async function checkReportExists(owner, repo, options = {}) {
  const { environment = 'github', baseUrl } = options;

  const infoResponse = await fetch(repositoryInfoUrl(owner, repo, { environment, baseUrl }));
  if (!infoResponse.ok) {
    return { exists: false, message: 'Repository not found or inaccessible' };
  }

  const info = await infoResponse.json().catch(() => ({}));
  const defaultBranch = extractDefaultBranch(info, environment);
  const branchesToTry = [...new Set(['main', defaultBranch, 'master'])];

  for (const branch of branchesToTry) {
    const rawResponse = await fetch(
      constructRawUrl(owner, repo, branch, { environment, baseUrl }),
      { method: 'HEAD' }
    );
    if (rawResponse.ok) {
      return { exists: true, branch };
    }
  }

  return { exists: false, message: REPORT_MISSING_MESSAGE };
}

// Submission flow: validate input, verify the report file exists (best-effort
// pre-check), then hand off to the platform's issue tracker where the
// submitter's identity is captured and the CI validation happens.
export async function submitRepository({ owner, repo }, options = {}) {
  const validation = validateRepositoryInput(owner, repo);
  if (!validation.valid) {
    return { success: false, message: validation.errors.join('. ') + ' - required fields must be valid' };
  }

  const { environment = 'github' } = options;
  const cleanOwner = owner.trim();
  const cleanRepo = repo.trim();

  try {
    const report = await checkReportExists(cleanOwner, cleanRepo, options);
    if (!report.exists) {
      return { success: false, message: report.message };
    }
    return {
      success: true,
      issueUrl: buildSubmissionIssueUrl({ owner: cleanOwner, repo: cleanRepo, ...options }),
      message:
        `Repository verified. Continue on ${platformLabel(environment)} to submit — ` +
        'your account there will be recorded as the submitter.'
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
}
