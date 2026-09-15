import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { createApp } from '../../js/main.js';

const PAGE = '<section><h1>Getting Started</h1><div id="workflow-sample"></div></section>';
const SAMPLES = {
  github: '<p>GitHub Actions sample</p><pre><code>uses: actions/checkout@v4</code></pre>',
  gitlab: '<p>GitLab sample</p><pre><code>CI_JOB_TOKEN</code></pre>',
  bitbucket: '<p>Bitbucket sample</p><pre><code>bitbucket-pipelines</code></pre>'
};

describe('Getting Started workflow samples per hosting environment', () => {
  let mockFetch, app, root;

  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    root = document.getElementById('app');
    mockFetch = spyOn(global, 'fetch').mockImplementation(url => {
      if (url.endsWith('/templates/getting-started.html')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(PAGE) });
      }
      const sample = Object.keys(SAMPLES).find(env => url.endsWith(`/templates/workflow-sample-${env}.html`));
      if (sample) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(SAMPLES[sample]) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
  });

  afterEach(() => mockFetch.mockRestore());

  for (const env of ['github', 'gitlab', 'bitbucket']) {
    it(`shows only the ${env} sample on a ${env} deployment`, async () => {
      app = createApp({ root, hostEnvironment: env });
      history.replaceState(null, '', '/getting-started');
      await app.handleRoute();

      const sample = root.querySelector('#workflow-sample');
      expect(sample.textContent).toContain(
        { github: 'GitHub Actions', gitlab: 'GitLab', bitbucket: 'Bitbucket' }[env]
      );
      // None of the other environments' samples should be present
      for (const other of Object.keys(SAMPLES)) {
        if (other !== env) {
          expect(sample.innerHTML).not.toContain(SAMPLES[other]);
        }
      }
    });
  }

  it('detects the environment from the hostname by default', async () => {
    // jsdom test host is localhost -> defaults to github
    app = createApp({ root });
    history.replaceState(null, '', '/getting-started');
    await app.handleRoute();
    expect(root.querySelector('#workflow-sample').textContent).toContain('GitHub Actions');
  });

  it('respects explicit platform meta tag over hostname detection', async () => {
    // Add meta tag for explicit platform
    const meta = document.createElement('meta');
    meta.name = 'platform';
    meta.content = 'gitlab';
    document.head.appendChild(meta);

    app = createApp({ root });
    history.replaceState(null, '', '/getting-started');
    await app.handleRoute();
    expect(root.querySelector('#workflow-sample').textContent).toContain('GitLab');

    // Clean up
    document.head.removeChild(meta);
  });

  it('shows a friendly note when the sample cannot be loaded', async () => {
    mockFetch.mockImplementation(url => {
      if (url.endsWith('/templates/getting-started.html')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(PAGE) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    app = createApp({ root, hostEnvironment: 'gitlab' });
    history.replaceState(null, '', '/getting-started');
    await app.handleRoute();
    expect(root.querySelector('#workflow-sample').textContent).toContain('could not be loaded');
  });
});
