// Phase 4: <WorkflowSample> — environment-dependent CI sample injection.
// Ported from tests/integration/getting-started-samples.test.js.
import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { render, waitFor, installRtlDom } from './rtl';
import { jsx as _jsx } from 'react/jsx-runtime';
import WorkflowSample from '../../components/workflow-sample';

installRtlDom();

const SAMPLES = {
  github: '<p>GitHub Actions sample</p><pre><code>uses: actions/checkout@v4</code></pre>',
  gitlab: '<p>GitLab sample</p><pre><code>CI_JOB_TOKEN</code></pre>',
  bitbucket: '<p>Bitbucket sample</p><pre><code>bitbucket-pipelines</code></pre>'
};

let mockFetch;

beforeEach(() => {
  mockFetch = spyOn(global, 'fetch').mockImplementation(url => {
    const env = ['github', 'gitlab', 'bitbucket'].find(e => String(url).includes(`workflow-sample-${e}.html`));
    if (env) {
      return Promise.resolve({ ok: true, text: () => Promise.resolve(SAMPLES[env]) });
    }
    return Promise.resolve({ ok: false, status: 404 });
  });
});

afterEach(() => mockFetch.mockRestore());

describe('WorkflowSample', () => {
  for (const environment of ['github', 'gitlab', 'bitbucket']) {
    test(`shows only the ${environment} sample on a ${environment} deployment`, async () => {
      const { container } = render(_jsx(WorkflowSample, { environment }));
      await waitFor(() => {
        expect(container.textContent).toContain(
          { github: 'GitHub Actions', gitlab: 'GitLab', bitbucket: 'Bitbucket' }[environment]
        );
      });
      for (const other of Object.keys(SAMPLES)) {
        if (other !== environment) {
          expect(container.innerHTML).not.toContain(SAMPLES[other]);
        }
      }
    });
  }

  test('detects the environment from the hostname by default', async () => {
    // jsdom test host is localhost -> defaults to github
    const { container } = render(_jsx(WorkflowSample, {}));
    await waitFor(() => {
      expect(container.textContent).toContain('GitHub Actions');
    });
  });

  test('respects the platform meta tag over hostname detection', async () => {
    const meta = document.createElement('meta');
    meta.name = 'platform';
    meta.content = 'gitlab';
    document.head.appendChild(meta);
    try {
      const { container } = render(_jsx(WorkflowSample, {}));
      await waitFor(() => {
        expect(container.textContent).toContain('GitLab');
      });
    } finally {
      document.head.removeChild(meta);
    }
  });

  test('shows a friendly note when the sample cannot be loaded', async () => {
    mockFetch.mockImplementation(() => Promise.resolve({ ok: false, status: 404 }));
    const { container } = render(_jsx(WorkflowSample, { environment: 'gitlab' }));
    await waitFor(() => {
      expect(container.textContent).toContain('could not be loaded');
    });
  });
});
