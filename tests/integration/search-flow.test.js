import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { createApp } from '../../js/main.js';

const REPOS_TXT = 'apache/tomcat\nrefactorfirst/refactorfirst\nspring-projects/spring-framework\n';

describe('Landing page and search flow integration', () => {
  let mockFetch, app, root, navigations;

  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    root = document.getElementById('app');
    navigations = [];
    mockFetch = spyOn(global, 'fetch').mockImplementation(requested => {
      if (requested.endsWith('/repositories.txt')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(REPOS_TXT) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
  });

  afterEach(() => mockFetch.mockRestore());

  it('renders the landing page with hero, search and Add Repo call-to-action', async () => {
    app = createApp({ root, onNavigate: to => navigations.push(to) });
    history.replaceState(null, '', '/');
    await app.handleRoute();
    expect(root.querySelector('.hero')).not.toBeNull();
    expect(root.querySelector('input[type="search"]')).not.toBeNull();
    expect(root.textContent).toContain('Add My Repo');
  });

  it('shows featured repositories from the listing', async () => {
    app = createApp({ root, onNavigate: to => navigations.push(to) });
    history.replaceState(null, '', '/');
    await app.handleRoute();
    const featured = root.querySelector('.featured-repos');
    expect(featured).not.toBeNull();
    expect(featured.textContent).toContain('refactorfirst/refactorfirst');
  });

  it('type-ahead navigates to the chosen repository', async () => {
    app = createApp({ root, onNavigate: to => navigations.push(to) });
    history.replaceState(null, '', '/');
    await app.handleRoute();

    const input = root.querySelector('input[type="search"]');
    input.value = 'tomcat';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));

    const option = root.querySelector('.search-results li');
    expect(option.textContent).toBe('apache/tomcat');
    option.click();
    expect(navigations).toEqual(['/apache/tomcat']);
  });

  it('lists a user\'s repositories alphabetically on the user page', async () => {
    app = createApp({ root });
    history.replaceState(null, '', '/spring-projects');
    await app.handleRoute();

    const cards = root.querySelectorAll('.repo-card');
    expect(cards.length).toBe(1);
    expect(root.textContent).toContain('spring-framework');
  });

  it('paginates large listings with ?page=N', async () => {
    const many = Array.from({ length: 75 }, (_, i) => `alice/repo-${String(i).padStart(3, '0')}`).join('\n');
    mockFetch.mockImplementation(requested => {
      if (requested.endsWith('/repositories.txt')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(many) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    app = createApp({ root });
    history.replaceState(null, '', '/alice?page=2');
    await app.handleRoute();

    const cards = root.querySelectorAll('.repo-card');
    expect(cards.length).toBe(25);
    expect(cards[0].textContent).toContain('repo-050');
    const pagination = root.querySelector('nav.pagination');
    expect(pagination).not.toBeNull();
    expect(pagination.querySelector('[aria-current="page"]').textContent).toBe('2');
  });

  it('renders static pages from their templates', async () => {
    mockFetch.mockImplementation(requested => {
      if (requested.endsWith('/templates/about.html')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve('<h1>About RefactorFirst</h1>') });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    app = createApp({ root });
    history.replaceState(null, '', '/about');
    await app.handleRoute();
    expect(root.querySelector('h1').textContent).toBe('About RefactorFirst');
  });
});
