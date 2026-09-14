import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { fetchJson, fetchTemplate, constructRawUrl, constructTemplateUrl } from '../../js/fetcher.js';

describe('GitHub API Fetching', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = spyOn(global, 'fetch');
  });

  afterEach(() => {
    mockFetch.mockRestore();
  });

  it('should fetch JSON data successfully', async () => {
    const mockData = { name: 'test-repo', metrics: { classes: 100 } };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData)
    });

    const result = await fetchJson('user', 'repo', 'main');
    expect(result).toEqual(mockData);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/user/repo/main/.refactorfirst/refactor-first.json',
      expect.any(Object)
    );
  });

  it('should handle 404 errors', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404
    });

    await expect(fetchJson('user', 'repo', 'main')).rejects.toThrow('Repository not found');
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    await expect(fetchJson('user', 'repo', 'main')).rejects.toThrow('Network error');
  });

  it('should fetch Mustache template successfully', async () => {
    const mockTemplate = '<html>{{content}}</html>';
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockTemplate)
    });

    const result = await fetchTemplate('user', 'repo', 'main');
    expect(result).toBe(mockTemplate);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/user/repo/main/.refactorfirst/refactor-first-report.mustache',
      expect.any(Object)
    );
  });

  it('should return fallback template when template fetch fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404
    });

    const fallbackTemplate = '<html>fallback</html>';
    const result = await fetchTemplate('user', 'repo', 'main', fallbackTemplate);
    expect(result).toBe(fallbackTemplate);
  });

  it('should construct correct raw URL', () => {
    const url = constructRawUrl('user', 'repo', 'branch');
    expect(url).toBe('https://raw.githubusercontent.com/user/repo/branch/.refactorfirst/refactor-first.json');
  });

  it('should construct correct template URL', () => {
    const url = constructTemplateUrl('user', 'repo', 'branch');
    expect(url).toBe('https://raw.githubusercontent.com/user/repo/branch/.refactorfirst/refactor-first-report.mustache');
  });

  it('should construct GitLab raw URLs with -/raw/ and honor a custom base URL', () => {
    expect(constructRawUrl('group', 'proj', 'main', { environment: 'gitlab' }))
      .toBe('https://gitlab.com/group/proj/-/raw/main/.refactorfirst/refactor-first.json');
    expect(constructRawUrl('group', 'proj', 'main', { environment: 'gitlab', baseUrl: 'https://gl.example.com/' }))
      .toBe('https://gl.example.com/group/proj/-/raw/main/.refactorfirst/refactor-first.json');
    expect(constructTemplateUrl('group', 'proj', 'main', { environment: 'gitlab' }))
      .toBe('https://gitlab.com/group/proj/-/raw/main/.refactorfirst/refactor-first-report.mustache');
  });

  it('should construct Bitbucket raw URLs', () => {
    expect(constructRawUrl('ws', 'proj', 'main', { environment: 'bitbucket' }))
      .toBe('https://bitbucket.org/ws/proj/raw/main/.refactorfirst/refactor-first.json');
    expect(constructTemplateUrl('ws', 'proj', 'main', { environment: 'bitbucket' }))
      .toBe('https://bitbucket.org/ws/proj/raw/main/.refactorfirst/refactor-first-report.mustache');
  });

  it('falls back to GitHub URLs for unknown environments', () => {
    expect(constructRawUrl('user', 'repo', 'main', { environment: 'something-else' }))
      .toBe('https://raw.githubusercontent.com/user/repo/main/.refactorfirst/refactor-first.json');
  });

  it('should include headers in fetch requests', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    });

    await fetchJson('user', 'repo', 'main');
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({
        'Accept': 'application/json'
      })
    }));
  });
});