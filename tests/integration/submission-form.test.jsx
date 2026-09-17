// Phase 6: <RepoSubmissionForm> — ports tests/integration/submission-flow.test.js
// to the React component: inline validation errors, disabled pending
// state, success with platform-labeled issue link + redirect handoff,
// per-platform issue URLs and config-context defaults.
import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { mock } from 'bun:test';

mock.module('next/navigation', () => ({
  usePathname: () => '/add-repo',
  useRouter: () => ({ push: () => {} }),
  useSearchParams: () => new URLSearchParams('')
}));

import { render, waitFor, fireEvent, cleanup, installRtlDom } from './rtl';
import { createElement as h } from 'react';
import RepoSubmissionForm from '../../components/repo-submission-form';
import { PlatformConfigProvider, usePlatformConfig } from '../../components/platform-config';

installRtlDom();

let mockFetch;
let redirects;

function respondOk() {
  mockFetch.mockImplementation(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('{}') }));
}

function renderForm(config = {}, props = {}) {
  redirects = [];
  return render(h(PlatformConfigProvider, {
      value: {
        environment: 'github',
        platformBaseUrl: null,
        submissionTarget: 'refactorfirst/refactorfirst.github.io',
        ...config
      }
    }, h(RepoSubmissionForm, {
      onExternalRedirect: url => redirects.push(url),
      ...props
    })));
}

function submit(container, { owner, repo } = {}) {
  const ownerInput = container.querySelector('#repo-owner');
  const repoInput = container.querySelector('#repo-name');
  if (owner !== undefined) fireEvent.change(ownerInput, { target: { value: owner } });
  if (repo !== undefined) fireEvent.change(repoInput, { target: { value: repo } });
  fireEvent.submit(container.querySelector('#repo-form'));
}

describe('RepoSubmissionForm', () => {
  beforeEach(() => {
    mockFetch = spyOn(global, 'fetch');
  });
  afterEach(() => {
    mockFetch.mockRestore();
    cleanup();
  });

  test('renders the form immediately without any login gate', () => {
    const { container } = renderForm();
    expect(container.querySelector('#repo-owner')).toBeTruthy();
    expect(container.querySelector('#repo-name')).toBeTruthy();
    expect(container.querySelector('button[type="submit"]')).toBeTruthy();
    expect(container.textContent).not.toMatch(/log in|sign in/i);
    expect(container.querySelector('.form-status')?.getAttribute('aria-live')).toBe('polite');
  });

  // Layout cleanup: the add-repo section uses the bounded prose column
  // (plans/layout-cleanup-plan.md).
  test('uses the content-page layout class on its section', () => {
    const { container } = renderForm();
    const section = container.querySelector('section');
    expect(section.className).toContain('add-repo-page');
    expect(section.className).toContain('content-page');
  });

  test('shows inline validation errors for empty fields', async () => {
    const { container } = renderForm();
    submit(container, {});
    const status = container.querySelector('.form-status');
    expect(status.textContent).toContain('User/organization (owner) name is required');
    expect(status.textContent).toContain('Repository name is required');
    expect(status.classList.contains('error')).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(redirects).toEqual([]);
  });

  test('shows inline validation error for invalid characters', () => {
    const { container } = renderForm();
    submit(container, { owner: 'not a name!', repo: 'repo' });
    const status = container.querySelector('.form-status');
    expect(status.classList.contains('error')).toBe(true);
    expect(status.textContent.length).toBeGreaterThan(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('disables the button and shows progress while validating', async () => {
    let resolveFirst;
    mockFetch.mockImplementation(() => new Promise(resolve => (resolveFirst = resolve)));
    const { container } = renderForm();
    submit(container, { owner: 'alice', repo: 'demo' });
    const button = container.querySelector('button[type="submit"]');
    const status = container.querySelector('.form-status');
    expect(button.disabled).toBe(true);
    expect(status.textContent).toContain('Validating repository');

    // Release the pending probe; subsequent probes resolve immediately
    mockFetch.mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    resolveFirst({ ok: true, json: () => Promise.resolve({}) });
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  test('success: shows the issue link and hands off to the platform in a new tab', async () => {
    respondOk();
    const { container } = renderForm();
    submit(container, { owner: 'alice', repo: 'demo' });

    await waitFor(() => {
      const status = container.querySelector('.form-status');
      expect(status.classList.contains('success')).toBe(true);
    });
    const status = container.querySelector('.form-status');
    const link = status.querySelector('a[href]');
    expect(link).toBeTruthy();
    expect(link.href).toContain('github.com/refactorfirst/refactorfirst.github.io/issues/new');
    expect(link.href).toContain('Add+repository%3A+alice%2Fdemo');
    expect(link.textContent).toContain('GitHub');
    expect(link.getAttribute('rel')).toContain('noopener');
    // external hand-off happened via the redirect hook
    expect(redirects).toEqual([link.href]);
  });

  test('failure (report missing): shows the error copy and no redirect', async () => {
    mockFetch.mockImplementation(url => {
      const s = String(url);
      if (s.startsWith('https://api.github.com/')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    const { container } = renderForm();
    submit(container, { owner: 'alice', repo: 'demo' });
    await waitFor(() => {
      const status = container.querySelector('.form-status');
      expect(status.classList.contains('error')).toBe(true);
    });
    expect(container.querySelector('.form-status').textContent).toContain('refactor-first.json');
    expect(redirects).toEqual([]);
  });

  test.each([
    ['gitlab', '/-/issues/new', 'gitlab.com'],
    ['bitbucket', 'bitbucket.org', 'issues/new']
  ])('builds a %s issue URL', async (environment, markerA, markerB) => {
    respondOk();
    const { container } = renderForm({ environment });
    submit(container, { owner: 'alice', repo: 'demo' });
    await waitFor(() => {
      expect(container.querySelector('.form-status').classList.contains('success')).toBe(true);
    });
    const link = container.querySelector('.form-status a[href]');
    expect(link.href).toContain(markerA);
    expect(link.href).toContain(markerB);
  });

  test('gitlab with a custom platform-base-url targets the self-managed instance', async () => {
    respondOk();
    const { container } = renderForm({
      environment: 'gitlab',
      platformBaseUrl: 'https://gitlab.example.org'
    });
    submit(container, { owner: 'alice', repo: 'demo' });
    await waitFor(() => {
      expect(container.querySelector('.form-status').classList.contains('success')).toBe(true);
    });
    const link = container.querySelector('.form-status a[href]');
    expect(link.href).toContain('https://gitlab.example.org/');
    expect(link.href).toContain('/-/issues/new');
  });
});

describe('PlatformConfigProvider', () => {
  test('provides config values through context', () => {
    let captured;
    const Probe = () => {
      captured = usePlatformConfig();
      return null;
    };
    render(h(PlatformConfigProvider,
      { value: { environment: 'gitlab', platformBaseUrl: 'https://gitlab.example.org', submissionTarget: 'x/y' } },
      h(Probe, {})));
    expect(captured).toEqual({
      environment: 'gitlab',
      platformBaseUrl: 'https://gitlab.example.org',
      submissionTarget: 'x/y'
    });
  });

  test('falls back to DEFAULT_SUBMISSION_TARGET without provider value or meta tag', () => {
    document.querySelectorAll('meta[name="submission-target"]').forEach(m => m.remove());
    let captured;
    const Probe = () => {
      captured = usePlatformConfig();
      return null;
    };
    render(h(PlatformConfigProvider, {}, h(Probe, {})));
    expect(captured.submissionTarget).toBe('refactorfirst/refactorfirst.github.io');
  });

  test('reads the submission-target meta tag when no provider value is set', () => {
    const meta = document.createElement('meta');
    meta.name = 'submission-target';
    meta.content = 'acme/listing';
    document.head.appendChild(meta);
    let captured;
    const Probe = () => {
      captured = usePlatformConfig();
      return null;
    };
    try {
      render(h(PlatformConfigProvider, {}, h(Probe, {})));
      expect(captured.submissionTarget).toBe('acme/listing');
    } finally {
      meta.remove();
    }
  });
});
