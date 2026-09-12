import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import {
  validateRepositoryInput,
  checkRepositoryAccess,
  checkReportExists,
  triggerAddRepositoryWorkflow,
  submitRepository,
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

describe('checkRepositoryAccess', () => {
  let mockFetch;
  beforeEach(() => { mockFetch = spyOn(global, 'fetch'); });
  afterEach(() => mockFetch.mockRestore());

  it('returns granted when the user is a collaborator with write access', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ permission: 'admin' })
    });

    const result = await checkRepositoryAccess('owner', 'repo', 'user', 'token');
    expect(result.granted).toBe(true);
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.github.com/repos/owner/repo/collaborators/user');
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer token');
  });

  it('denies access when the collaborator check returns 404', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const result = await checkRepositoryAccess('owner', 'repo', 'user', 'token');
    expect(result.granted).toBe(false);
    expect(result.reason).toContain('access');
  });

  it('denies access when the user has only read permission', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ permission: 'read' })
    });
    const result = await checkRepositoryAccess('owner', 'repo', 'user', 'token');
    expect(result.granted).toBe(false);
  });
});

describe('checkReportExists', () => {
  let mockFetch;
  beforeEach(() => { mockFetch = spyOn(global, 'fetch'); });
  afterEach(() => mockFetch.mockRestore());

  const rawMain = 'https://raw.githubusercontent.com/owner/repo/main/.refactorfirst/refactor-first.json';
  const rawDefault = 'https://raw.githubusercontent.com/owner/repo/develop/.refactorfirst/refactor-first.json';

  function mockRepoInfo(defaultBranch = 'develop') {
    return {
      ok: true,
      json: () => Promise.resolve({ default_branch: defaultBranch })
    };
  }

  it('finds the report on the main branch', async () => {
    mockFetch.mockImplementation(url => {
      if (url === 'https://api.github.com/repos/owner/repo') {
        return Promise.resolve(mockRepoInfo());
      }
      if (url === rawMain) return Promise.resolve({ ok: true });
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await checkReportExists('owner', 'repo', 'token');
    expect(result.exists).toBe(true);
    expect(result.branch).toBe('main');
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

    const result = await checkReportExists('owner', 'repo', 'token');
    expect(result.exists).toBe(true);
    expect(result.branch).toBe('develop');
    expect(mockFetch.mock.calls.some(c => c[0] === rawMain)).toBe(true);
    expect(mockFetch.mock.calls.some(c => c[0] === rawDefault)).toBe(true);
  });

  it('reports missing when neither main nor the default branch has the file', async () => {
    mockFetch.mockImplementation(url => {
      if (url === 'https://api.github.com/repos/owner/repo') {
        return Promise.resolve(mockRepoInfo('develop'));
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await checkReportExists('owner', 'repo', 'token');
    expect(result.exists).toBe(false);
    expect(result.message).toBe('The repository specified must have a .refactorfirst/refactor-first.json file present.');
    expect(REPORT_MISSING_MESSAGE).toContain('refactor-first.json');
  });

  it('does not check the default branch twice when it is main', async () => {
    mockFetch.mockImplementation(url => {
      if (url === 'https://api.github.com/repos/owner/repo') {
        return Promise.resolve(mockRepoInfo('main'));
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await checkReportExists('owner', 'repo', 'token');
    expect(result.exists).toBe(false);
    expect(mockFetch.mock.calls.filter(c => c[0] === rawMain).length).toBe(1);
  });

  it('reports missing when the repository info call fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const result = await checkReportExists('owner', 'repo', 'token');
    expect(result.exists).toBe(false);
    expect(result.message).toContain('Repository not found');
  });

  it('passes the auth token to the GitHub API call', async () => {
    mockFetch.mockImplementation(url => {
      if (url === 'https://api.github.com/repos/owner/repo') {
        return Promise.resolve(mockRepoInfo());
      }
      return Promise.resolve({ ok: true });
    });
    await checkReportExists('owner', 'repo', 'secret-token');
    const call = mockFetch.mock.calls.find(c => c[0] === 'https://api.github.com/repos/owner/repo');
    expect(call[1].headers.Authorization).toBe('Bearer secret-token');
  });
});

describe('triggerAddRepositoryWorkflow', () => {
  let mockFetch;
  beforeEach(() => { mockFetch = spyOn(global, 'fetch'); });
  afterEach(() => mockFetch.mockRestore());

  it('sends a repository_dispatch event to the listing repository', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204 });
    await triggerAddRepositoryWorkflow({
      owner: 'octocat', repo: 'hello-world', submittedBy: 'octocat',
      token: 'token', dispatchRepo: 'refactorfirst/refactorfirst.github.io'
    });

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/refactorfirst/refactorfirst.github.io/dispatches');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body);
    expect(body.event_type).toBe('add-repository');
    expect(body.client_payload).toEqual({
      owner: 'octocat', repo: 'hello-world', submitted_by: 'octocat'
    });
  });

  it('throws a friendly error when the dispatch is unauthorized', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403 });
    await expect(triggerAddRepositoryWorkflow({
      owner: 'o', repo: 'r', submittedBy: 'u', token: 't',
      dispatchRepo: 'refactorfirst/refactorfirst.github.io'
    })).rejects.toThrow('403');
  });
});

describe('submitRepository (orchestration)', () => {
  let mockFetch;
  beforeEach(() => { mockFetch = spyOn(global, 'fetch'); });
  afterEach(() => mockFetch.mockRestore());

  it('validates input before making API calls', async () => {
    const result = await submitRepository({ owner: '', repo: '' }, 'user', 'token');
    expect(result.success).toBe(false);
    expect(result.message).toContain('required');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  function mockHappyPath() {
    mockFetch.mockImplementation(url => {
      if (url.includes('/collaborators/')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ permission: 'write' }) });
      }
      if (url === 'https://api.github.com/repos/o/r') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ default_branch: 'main' }) });
      }
      if (url.includes('raw.githubusercontent.com/o/r/main/')) {
        return Promise.resolve({ ok: true });
      }
      if (url.endsWith('/dispatches')) {
        return Promise.resolve({ ok: true, status: 204 });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
  }

  it('checks access then triggers the workflow on success', async () => {
    mockHappyPath();
    const result = await submitRepository({ owner: 'o', repo: 'r' }, 'user', 'token');
    expect(result.success).toBe(true);
    expect(mockFetch.mock.calls.some(c => c[0].endsWith('/dispatches'))).toBe(true);
  });

  it('rejects repositories without .refactorfirst/refactor-first.json', async () => {
    mockFetch.mockImplementation(url => {
      if (url.includes('/collaborators/')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ permission: 'write' }) });
      }
      if (url === 'https://api.github.com/repos/o/r') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ default_branch: 'develop' }) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await submitRepository({ owner: 'o', repo: 'r' }, 'user', 'token');
    expect(result.success).toBe(false);
    expect(result.message).toBe('The repository specified must have a .refactorfirst/refactor-first.json file present.');
    expect(mockFetch.mock.calls.some(c => c[0].endsWith('/dispatches'))).toBe(false);
  });

  it('reports access failures without triggering the workflow', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const result = await submitRepository({ owner: 'o', repo: 'r' }, 'user', 'token');
    expect(result.success).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
