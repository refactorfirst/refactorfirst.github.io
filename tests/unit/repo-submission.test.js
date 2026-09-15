import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import {
  validateRepositoryInput,
  buildSubmissionIssueUrl,
  repositoryInfoUrl,
  checkReportExists,
  submitRepository,
  platformLabel,
  DEFAULT_SUBMISSION_TARGET,
  REPORT_MISSING_MESSAGE
} from '../../js/repo-submission.js';

describe('validateRepositoryInput', () => {
  it('accepts valid owner and repository names', () => {
    const result = validateRepositoryInput('octocat', 'hello-world');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('requires both fields', () => {
    const result = validateRepositoryInput('', '');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(2);
  });

  it('rejects special characters', () => {
    const result = validateRepositoryInput('bad name', '<repo>');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('owner'))).toBe(true);
    expect(result.errors.some(e => e.includes('repository'))).toBe(true);
  });
});

describe('platformLabel', () => {
  it('maps environments to display names', () => {
    expect(platformLabel('github')).toBe('GitHub');
    expect(platformLabel('gitlab')).toBe('GitLab');
    expect(platformLabel('bitbucket')).toBe('Bitbucket');
    expect(platformLabel('unknown')).toBe('GitHub');
  });
});

describe('buildSubmissionIssueUrl', () => {
  it('builds a GitHub issue URL with the template and encoded title', () => {
    const url = buildSubmissionIssueUrl({ owner: 'octocat', repo: 'hello-world' });
    expect(url.startsWith('https://github.com/refactorfirst/refactorfirst.github.io/issues/new?')).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get('title')).toBe('Add repository: octocat/hello-world');
    expect(params.get('template')).toBe('add-repo.md');
  });

  it('honors a custom submission target for GitHub', () => {
    const url = buildSubmissionIssueUrl({ owner: 'o', repo: 'r', target: 'my-org/my-site' });
    expect(url.startsWith('https://github.com/my-org/my-site/issues/new?')).toBe(true);
  });

  it('builds a GitLab issue URL with issue[title] and the template', () => {
    const url = buildSubmissionIssueUrl({ owner: 'o', repo: 'r', environment: 'gitlab' });
    expect(url.startsWith('https://gitlab.com/refactorfirst/refactorfirst.github.io/-/issues/new?')).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get('issue[title]')).toBe('Add repository: o/r');
    expect(params.get('issuable_template')).toBe('Add repository');
  });

  it('honors a custom base URL for self-managed GitLab', () => {
    const url = buildSubmissionIssueUrl({
      owner: 'o', repo: 'r', environment: 'gitlab',
      baseUrl: 'https://gitlab.example.com/'
    });
    expect(url.startsWith('https://gitlab.example.com/refactorfirst/refactorfirst.github.io/-/issues/new?')).toBe(true);
  });

  it('builds a Bitbucket issue URL with the title', () => {
    const url = buildSubmissionIssueUrl({ owner: 'o', repo: 'r', environment: 'bitbucket' });
    expect(url.startsWith('https://bitbucket.org/refactorfirst/refactorfirst.github.io/issues/new?')).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get('title')).toBe('Add repository: o/r');
  });

  it('uses the default submission target constant', () => {
    expect(DEFAULT_SUBMISSION_TARGET).toBe('refactorfirst/refactorfirst.github.io');
  });
});

describe('repositoryInfoUrl', () => {
  it('builds the GitHub repo API URL', () => {
    expect(repositoryInfoUrl('o', 'r')).toBe('https://api.github.com/repos/o/r');
  });

  it('builds the GitLab project API URL with an encoded path', () => {
    expect(repositoryInfoUrl('my-group', 'my-repo', { environment: 'gitlab' }))
      .toBe('https://gitlab.com/api/v4/projects/my-group%2Fmy-repo');
    expect(repositoryInfoUrl('o', 'r', { environment: 'gitlab', baseUrl: 'https://gl.example.com/' }))
      .toBe('https://gl.example.com/api/v4/projects/o%2Fr');
  });

  it('builds the Bitbucket repository API URL', () => {
    expect(repositoryInfoUrl('ws', 'r', { environment: 'bitbucket' }))
      .toBe('https://api.bitbucket.org/2.0/repositories/ws/r');
  });
});

describe('checkReportExists (unauthenticated)', () => {
  let mockFetch;
  beforeEach(() => { mockFetch = spyOn(global, 'fetch'); });
  afterEach(() => mockFetch.mockRestore());

  const rawMain = 'https://raw.githubusercontent.com/owner/repo/refs/heads/main/.refactorfirst/refactor-first.json';
  const rawDefault = 'https://raw.githubusercontent.com/owner/repo/refs/heads/develop/.refactorfirst/refactor-first.json';

  function mockRepoInfo(defaultBranch = 'develop') {
    return {
      ok: true,
      json: () => Promise.resolve({ default_branch: defaultBranch })
    };
  }

  it('finds the report on the main branch without any token', async () => {
    mockFetch.mockImplementation(url => {
      if (url === 'https://api.github.com/repos/owner/repo') {
        return Promise.resolve(mockRepoInfo());
      }
      if (url === rawMain) return Promise.resolve({ ok: true });
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await checkReportExists('owner', 'repo');
    expect(result.exists).toBe(true);
    expect(result.branch).toBe('main');
    const infoCall = mockFetch.mock.calls.find(c => c[0] === 'https://api.github.com/repos/owner/repo');
    expect(infoCall[1]).toBeUndefined();
  });

  it('falls back to the default branch when main returns 404', async () => {
    mockFetch.mockImplementation(url => {
      if (url === 'https://api.github.com/repos/owner/repo') {
        return Promise.resolve(mockRepoInfo('develop'));
      }
      if (url === rawMain) return Promise.resolve({ ok: false, status: 404 });
      if (url === rawDefault) return Promise.resolve({ ok: true });
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await checkReportExists('owner', 'repo');
    expect(result.exists).toBe(true);
    expect(result.branch).toBe('develop');
    expect(mockFetch.mock.calls.some(c => c[0] === rawMain)).toBe(true);
    expect(mockFetch.mock.calls.some(c => c[0] === rawDefault)).toBe(true);
  });

  it('falls back to master when main and the default branch miss', async () => {
    mockFetch.mockImplementation(url => {
      if (url === 'https://api.github.com/repos/owner/repo') {
        return Promise.resolve(mockRepoInfo('develop'));
      }
      if (url === 'https://raw.githubusercontent.com/owner/repo/refs/heads/master/.refactorfirst/refactor-first.json') {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await checkReportExists('owner', 'repo');
    expect(result.exists).toBe(true);
    expect(result.branch).toBe('master');
  });

  it('reports missing when no candidate branch has the file', async () => {
    mockFetch.mockImplementation(url => {
      if (url === 'https://api.github.com/repos/owner/repo') {
        return Promise.resolve(mockRepoInfo('develop'));
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await checkReportExists('owner', 'repo');
    expect(result.exists).toBe(false);
    expect(result.message).toBe(REPORT_MISSING_MESSAGE);
    expect(REPORT_MISSING_MESSAGE).toContain('refactor-first.json');
  });

  it('does not check the default branch twice when it is main', async () => {
    mockFetch.mockImplementation(url => {
      if (url === 'https://api.github.com/repos/owner/repo') {
        return Promise.resolve(mockRepoInfo('main'));
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await checkReportExists('owner', 'repo');
    expect(result.exists).toBe(false);
    expect(mockFetch.mock.calls.filter(c => c[0] === rawMain).length).toBe(1);
  });

  it('reports missing when the repository info call fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const result = await checkReportExists('owner', 'repo');
    expect(result.exists).toBe(false);
    expect(result.message).toContain('Repository not found');
  });

  it('checks GitLab projects with the raw file URL scheme', async () => {
    mockFetch.mockImplementation(url => {
      if (url === 'https://gitlab.com/api/v4/projects/group%2Fproj') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ default_branch: 'main' }) });
      }
      if (url === 'https://gitlab.com/group/proj/-/raw/main/.refactorfirst/refactor-first.json') {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await checkReportExists('group', 'proj', { environment: 'gitlab' });
    expect(result.exists).toBe(true);
    expect(result.branch).toBe('main');
  });

  it('reads the Bitbucket mainbranch and uses the raw URL scheme', async () => {
    mockFetch.mockImplementation(url => {
      if (url === 'https://api.bitbucket.org/2.0/repositories/ws/proj') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ mainbranch: { name: 'develop' } }) });
      }
      if (url === 'https://bitbucket.org/ws/proj/raw/develop/.refactorfirst/refactor-first.json') {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await checkReportExists('ws', 'proj', { environment: 'bitbucket' });
    expect(result.exists).toBe(true);
    expect(result.branch).toBe('develop');
  });
});

describe('submitRepository (orchestration)', () => {
  let mockFetch;
  beforeEach(() => { mockFetch = spyOn(global, 'fetch'); });
  afterEach(() => mockFetch.mockRestore());

  it('validates input before making API calls', async () => {
    const result = await submitRepository({ owner: '', repo: '' });
    expect(result.success).toBe(false);
    expect(result.message).toContain('required');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns the GitHub issue URL after a successful check', async () => {
    mockFetch.mockImplementation(url => {
      if (url === 'https://api.github.com/repos/o/r') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ default_branch: 'main' }) });
      }
      if (url.includes('raw.githubusercontent.com/o/r/refs/heads/main/')) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await submitRepository({ owner: 'o', repo: 'r' });
    expect(result.success).toBe(true);
    expect(new URL(result.issueUrl).searchParams.get('title')).toBe('Add repository: o/r');
    expect(result.message).toContain('GitHub');
  });

  it('returns the platform issue URL for other environments', async () => {
    mockFetch.mockImplementation(url => {
      if (url === 'https://gitlab.com/api/v4/projects/g%2Fr') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ default_branch: 'main' }) });
      }
      if (url === 'https://gitlab.com/g/r/-/raw/main/.refactorfirst/refactor-first.json') {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await submitRepository({ owner: 'g', repo: 'r' }, { environment: 'gitlab' });
    expect(result.success).toBe(true);
    expect(result.issueUrl.startsWith('https://gitlab.com/')).toBe(true);
    expect(result.message).toContain('GitLab');
  });

  it('rejects repositories without .refactorfirst/refactor-first.json', async () => {
    mockFetch.mockImplementation(url => {
      if (url === 'https://api.github.com/repos/o/r') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ default_branch: 'develop' }) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await submitRepository({ owner: 'o', repo: 'r' });
    expect(result.success).toBe(false);
    expect(result.message).toBe(REPORT_MISSING_MESSAGE);
    expect(result.issueUrl).toBeUndefined();
  });

  it('reports unknown repositories', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const result = await submitRepository({ owner: 'ghost', repo: 'nope' });
    expect(result.success).toBe(false);
    expect(result.message).toContain('Repository not found');
  });
});
