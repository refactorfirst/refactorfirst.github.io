// Main application entry point: routes URLs to renderers and wires the UI.

import {
  classifyRoute,
  getQueryParam,
  navigateTo,
  onRouteChange,
  buildRepositoryListUrl
} from './router.js';
import { parseRepositories, createSearch } from './search.js';
import {
  escapeHtml,
  paginate,
  reposForUser,
  sortByRepository,
  renderPaginationControls,
  detectHostingEnvironment
} from './utils.js';
import { fetchReport } from './fetcher.js';
import { renderTemplate } from './renderer.js';
import { renderErrorPage, logError } from './error-handler.js';
import {
  buildAuthorizationUrl,
  parseCallback,
  exchangeCodeForToken,
  isAuthenticated,
  fetchUserProfile,
  getToken,
  logout
} from './oauth-handler.js';
import { submitRepository, validateRepositoryInput } from './repo-submission.js';

// The GitHub OAuth Client ID is deployment-specific and configured via the
// <meta name="oauth-client-id"> tag in index.html.
function getOAuthClientId() {
  return document.querySelector('meta[name="oauth-client-id"]')?.content?.trim() || '';
}
const OAUTH_SCOPES = ['public_repo', 'read:user'];
const FEATURED_COUNT = 6;

// Built-in fallback page fragments used when the HTML templates in
// /templates cannot be loaded (e.g. file:// testing or network failure).
const FALLBACK_LANDING = `
  <section class="hero">
    <h1>RefactorFirst</h1>
    <p>Know which parts of your codebase to refactor first. Search for a repository to see its report.</p>
    <p><a href="/add-repo" class="cta" data-link>Add My Repo</a></p>
    <div class="featured-repos"><h2>Featured Repositories</h2><ul></ul></div>
  </section>`;

const FALLBACK_USER_REPOS = `
  <h1>{{username}}</h1>
  <div class="repo-grid">{{{cards}}}</div>
  {{{pagination}}}`;

function renderHeroSearch(root) {
  const hero = root.querySelector('.hero') || root;
  const container = document.createElement('div');
  container.className = 'hero-search';
  container.innerHTML = `
    <input type="search" id="hero-search-input" placeholder="Search repositories..."
           aria-label="Search repositories" autocomplete="off"
           aria-expanded="false" aria-controls="hero-search-results" role="combobox">
    <ul id="hero-search-results" class="search-results" role="listbox" hidden></ul>`;
  hero.insertBefore(container, hero.querySelector('.featured-repos'));
  return container;
}

function fetchText(url) {
  return fetch(url).then(response => {
    if (!response.ok) {
      const error = new Error(`Failed to load ${url}`);
      error.status = response.status;
      throw error;
    }
    return response.text();
  });
}

export function createApp({ root, onNavigate, onExternalRedirect, hostEnvironment } = {}) {
  if (!root) throw new Error('createApp requires a root element');

  const environment = hostEnvironment || detectHostingEnvironment(location.hostname);

  const navigate = onNavigate || navigateTo;
  const externalRedirect = onExternalRedirect || (url => { location.assign(url); });
  const pending = new Set();
  let repositoriesPromise = null;

  function loadRepositories() {
    repositoriesPromise ||= fetchText('/repositories.txt').then(parseRepositories);
    return repositoriesPromise;
  }

  function track(promise) {
    pending.add(promise);
    promise.finally(() => pending.delete(promise));
    return promise;
  }

  async function renderLanding() {
    const repositories = await loadRepositories().catch(() => []);
    root.innerHTML = FALLBACK_LANDING;

    const featuredList = root.querySelector('.featured-repos ul');
    if (featuredList) {
      for (const repo of repositories.slice(0, FEATURED_COUNT)) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = buildRepositoryListUrl(repo.fullName);
        link.textContent = repo.fullName;
        link.setAttribute('data-link', '');
        item.appendChild(link);
        featuredList.appendChild(item);
      }
    }

    const searchContainer = renderHeroSearch(root);
    createSearch({
      input: searchContainer.querySelector('input'),
      resultsList: searchContainer.querySelector('ul'),
      repositories,
      debounceMs: 0,
      onNavigate: repo => navigate(buildRepositoryListUrl(repo.fullName))
    });
  }

  async function renderUserListing(username) {
    const repositories = await loadRepositories();
    const sorted = sortByRepository(reposForUser(repositories, username));
    const pageParam = getQueryParam(location.search, 'page');
    const { items, page, totalPages } = paginate(sorted, pageParam ? Number(pageParam) : 1);

    const cards = items.map(repo =>
      `<a class="repo-card" href="${escapeHtml(buildRepositoryListUrl(repo.fullName))}" data-link>
         <span class="repo-name">${escapeHtml(repo.repository)}</span>
       </a>`
    ).join('');

    root.innerHTML = renderTemplate(FALLBACK_USER_REPOS, {
      username,
      cards,
      pagination: renderPaginationControls({ page, totalPages, baseUrl: `/${username}` })
    });
  }

  async function renderReport({ username, repository, branch }) {
    root.innerHTML = '<p class="loading" role="status">Loading report&hellip;</p>';
    try {
      const fallbackTemplate = await fetch('/assets/refactor-first-report.mustache')
        .then(res => (res.ok ? res.text() : null))
        .catch(() => null);
      const { data, template, branch: resolvedBranch } =
        await fetchReport(username, repository, branch, { fallbackTemplate });
      root.innerHTML = renderTemplate(template, data);
      root.dataset.resolvedBranch = resolvedBranch;
    } catch (error) {
      logError(error, { route: 'report', username, repository, branch });
      renderErrorPage(root, error, { onRetry: () => track(renderReport({ username, repository, branch })) });
    }
  }

  function renderLogin() {
    root.innerHTML = `
      <section class="login-required">
        <h1>Add Your Repository</h1>
        <p>Sign in with GitHub to add your repository to the RefactorFirst listing.
           We request <code>public_repo</code> and <code>read:user</code> permissions so we can
           verify that you have access to the repository you are submitting.</p>
        <button id="login-github" type="button">Login with GitHub</button>
      </section>`;
    root.querySelector('#login-github').addEventListener('click', () => {
      track(
        buildAuthorizationUrl({
          clientId: getOAuthClientId(),
          redirectUri: `${location.origin}/add-repo/callback`,
          scopes: OAUTH_SCOPES
        }).then(url => externalRedirect(url))
      );
    });
  }

  function renderSubmissionForm(profile) {
    root.innerHTML = `
      <section class="add-repo-page">
        <h1>Add Your Repository</h1>
        <div class="user-info">
          <img class="user-avatar" src="${escapeHtml(profile.avatarUrl)}" alt="" width="40" height="40">
          <span>Signed in as <strong>${escapeHtml(profile.username)}</strong></span>
          <button id="logout" type="button">Log out</button>
        </div>
        <p class="info">Only repositories with a <code>.refactorfirst/refactor-first.json</code>
           file will be added. The RefactorFirst GitHub Page redeploys every 10 minutes.</p>
        <form id="repo-form" novalidate>
          <label for="repo-owner">User/Organization Name</label>
          <input id="repo-owner" name="owner" type="text" required autocomplete="off">
          <label for="repo-name">Repository Name</label>
          <input id="repo-name" name="repository" type="text" required autocomplete="off">
          <button type="submit">Submit Repository</button>
        </form>
        <p class="form-status" role="status" aria-live="polite"></p>
      </section>`;

    root.querySelector('#logout').addEventListener('click', () => {
      logout();
      navigate('/add-repo');
    });

    root.querySelector('#repo-form').addEventListener('submit', event => {
      event.preventDefault();
      const form = event.target;
      const button = form.querySelector('button[type="submit"]');
      const status = root.querySelector('.form-status');
      const owner = form.querySelector('#repo-owner').value;
      const repo = form.querySelector('#repo-name').value;

      const validation = validateRepositoryInput(owner, repo);
      status.classList.remove('success', 'error');
      if (!validation.valid) {
        status.textContent = validation.errors.join('. ');
        status.classList.add('error');
        return;
      }

      button.disabled = true;
      status.textContent = 'Validating repository...';
      track(
        submitRepository({ owner, repo }, profile.username, getToken())
          .then(result => {
            status.textContent = result.message;
            status.classList.add(result.success ? 'success' : 'error');
          })
          .catch(error => {
            status.textContent = error.message;
            status.classList.add('error');
          })
          .finally(() => { button.disabled = false; })
      );
    });
  }

  async function renderAddRepo() {
    if (!isAuthenticated()) {
      renderLogin();
      return;
    }
    try {
      const profile = await fetchUserProfile();
      renderSubmissionForm(profile);
    } catch (error) {
      logError(error, { route: 'add-repo' });
      renderErrorPage(root, error);
    }
  }

  async function renderOAuthCallback() {
    try {
      const { code } = parseCallback(location.search);
      const codeVerifier = sessionStorage.getItem('oauth_code_verifier');
      await exchangeCodeForToken({
        code,
        codeVerifier,
        clientId: getOAuthClientId(),
        redirectUri: `${location.origin}/add-repo/callback`
      });
      navigate('/add-repo');
    } catch (error) {
      logError(error, { route: 'oauth-callback' });
      renderErrorPage(root, error);
    }
  }

  // Load the CI sample matching the hosting environment into the
  // Getting Started page so users only see instructions for their platform.
  async function renderWorkflowSample() {
    const slot = root.querySelector('#workflow-sample');
    if (!slot) return;
    try {
      slot.innerHTML = await fetchText(`/templates/workflow-sample-${environment}.html`);
    } catch {
      slot.innerHTML =
        '<p class="form-status error">The workflow sample for this environment ' +
        'could not be loaded. See the repository README for manual setup instructions.</p>';
    }
  }

  async function renderStaticPage(page) {
    try {
      root.innerHTML = await fetchText(`/templates/${page}.html`);
      if (page === 'getting-started') {
        await renderWorkflowSample();
      }
    } catch (error) {
      logError(error, { route: 'page', page });
      renderErrorPage(root, error);
    }
  }

  async function handleRoute() {
    const route = classifyRoute(location.pathname);
    switch (route.type) {
      case 'landing':
        return renderLanding();
      case 'user':
        return renderUserListing(route.username);
      case 'report':
        return renderReport(route);
      case 'page':
        return renderStaticPage(route.page);
      case 'add-repo':
        return renderAddRepo();
      case 'oauth-callback':
        return renderOAuthCallback();
      default:
        return renderErrorPage(root, Object.assign(new Error('Page not found'), { status: 404 }));
    }
  }

  return {
    handleRoute,
    renderLanding,
    renderUserListing,
    renderReport,
    renderAddRepo,
    renderStaticPage,
    pendingSubmissions: () => Promise.all([...pending])
  };
}

// Boot the application against the real document.
export function initApp() {
  const root = document.getElementById('app');
  if (!root) {
    console.error('Root element #app not found');
    return;
  }
  
  const app = createApp({ root });

  // Top-menu search
  const menuInput = document.getElementById('menu-search-input');
  const menuResults = document.getElementById('menu-search-results');
  if (menuInput && menuResults) {
    fetchText('/repositories.txt').then(text => {
      createSearch({
        input: menuInput,
        resultsList: menuResults,
        repositories: parseRepositories(text)
      });
    }).catch(() => { /* search unavailable without repository listing */ });
  }

  // Hamburger menu
  const toggle = document.getElementById('menu-toggle');
  const links = document.getElementById('menu-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }

  // Intercept internal links for client-side navigation
  document.addEventListener('click', event => {
    const anchor = event.target.closest('a[data-link]');
    if (!anchor) return;
    const url = new URL(anchor.href, location.origin);
    if (url.origin !== location.origin) return;
    event.preventDefault();
    navigateTo(url.pathname + url.search);
  });

  onRouteChange(() => app.handleRoute());
  app.handleRoute();
}

if (typeof document !== 'undefined' && globalThis.__APP_AUTO_INIT__ !== false) {
  // Wait for DOM to be ready before initializing
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    // Use setTimeout to ensure DOM is fully processed
    setTimeout(initApp, 0);
  }
}
