import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import {
  fetchJsonWithFallback,
  fetchReport,
  fetchWithRetry
} from '../../lib/fetcher.js';

describe('fetchJsonWithFallback (branch fallback)', () => {
  let mockFetch;
  beforeEach(() => { mockFetch = spyOn(global, 'fetch'); });
  afterEach(() => mockFetch.mockRestore());

  const okJson = data => ({ ok: true, json: () => Promise.resolve(data) });
  const notFound = { ok: false, status: 404 };

  it('fetches from the requested branch when it succeeds', async () => {
    mockFetch.mockResolvedValue(okJson({ a: 1 }));
    const result = await fetchJsonWithFallback('u', 'r', 'develop');
    expect(result.branch).toBe('develop');
    expect(result.data).toEqual({ a: 1 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('falls back from main to master when main returns 404', async () => {
    mockFetch
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(okJson({ b: 2 }));
    const result = await fetchJsonWithFallback('u', 'r', 'main');
    expect(result.branch).toBe('master');
    expect(result.data).toEqual({ b: 2 });
  });

  it('only falls back when the default branch was requested', async () => {
    mockFetch.mockResolvedValue(notFound);
    await expect(fetchJsonWithFallback('u', 'r', 'feature-x')).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws when both main and master fail', async () => {
    mockFetch.mockResolvedValue(notFound);
    await expect(fetchJsonWithFallback('u', 'r', 'main')).rejects.toThrow('Repository not found');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('fetchReport (report JSON only; the bundled template is authoritative)', () => {
  let mockFetch;
  beforeEach(() => { mockFetch = spyOn(global, 'fetch'); });
  afterEach(() => mockFetch.mockRestore());

  it('returns data and the resolved branch', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ x: 1 }) });

    const report = await fetchReport('u', 'r', 'main');
    expect(report.data).toEqual({ x: 1 });
    expect(report.branch).toBe('main');
  });

  it('never requests a template from the repository', async () => {
    mockFetch
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ x: 1 }) });

    await fetchReport('u', 'r', 'main');
    expect(
      mockFetch.mock.calls.some(c => String(c[0]).endsWith('.refactorfirst/refactor-first-report.mustache'))
    ).toBe(false);
  });
});

describe('fetchWithRetry (exponential backoff)', () => {
  let mockFetch;
  beforeEach(() => { mockFetch = spyOn(global, 'fetch'); });
  afterEach(() => mockFetch.mockRestore());

  it('returns the first successful response', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const response = await fetchWithRetry('https://example.com');
    expect(response.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures then succeeds', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('network down'))
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ ok: true });

    const response = await fetchWithRetry('https://example.com', {}, { retries: 3, baseDelayMs: 1 });
    expect(response.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('gives up after exhausting retries', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));
    await expect(
      fetchWithRetry('https://example.com', {}, { retries: 2, baseDelayMs: 1 })
    ).rejects.toThrow('network down');
    expect(mockFetch).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does not retry on 4xx client errors', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const response = await fetchWithRetry('https://example.com', {}, { retries: 3, baseDelayMs: 1 });
    expect(response.status).toBe(404);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
