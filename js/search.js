// Type-ahead search backed by the static repositories.txt listing.

import { buildRepositoryListUrl, navigateTo } from './router.js';

export function parseRepositories(text) {
  if (!text) return [];
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const [username, repository] = line.split('/');
      if (!username || !repository) return null;
      return { username, repository, fullName: `${username}/${repository}` };
    })
    .filter(Boolean);
}

export function filterRepositories(repositories, query) {
  const normalized = (query || '').trim().toLowerCase();
  if (!normalized) return repositories;
  return repositories.filter(repo =>
    repo.fullName.toLowerCase().includes(normalized)
  );
}

export function debounce(fn, delayMs = 150) {
  if (delayMs <= 0) {
    return (...args) => fn(...args);
  }
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

// Wire a search input + result list with filtering, keyboard navigation
// and click-to-navigate behaviour.
export function createSearch({
  input,
  resultsList,
  repositories,
  onNavigate = repo => navigateTo(buildRepositoryListUrl(repo.fullName)),
  maxResults = 10,
  debounceMs = 100
}) {
  if (!input || !resultsList) {
    throw new Error('createSearch requires an input and a results list');
  }

  let activeIndex = -1;
  let matches = [];

  const close = () => {
    matches = [];
    activeIndex = -1;
    resultsList.innerHTML = '';
    resultsList.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  };

  const choose = repo => {
    close();
    onNavigate(repo);
  };

  const render = () => {
    resultsList.innerHTML = '';
    matches.forEach((repo, index) => {
      const item = document.createElement('li');
      item.setAttribute('role', 'option');
      item.id = `search-option-${index}`;
      item.textContent = repo.fullName;
      item.classList.toggle('active', index === activeIndex);
      item.setAttribute('aria-selected', index === activeIndex ? 'true' : 'false');
      item.addEventListener('click', () => choose(repo));
      resultsList.appendChild(item);
    });
    resultsList.hidden = matches.length === 0;
    input.setAttribute('aria-expanded', matches.length > 0 ? 'true' : 'false');
  };

  const update = debounce(() => {
    const query = input.value;
    if (!query.trim()) {
      close();
      return;
    }
    activeIndex = -1;
    matches = filterRepositories(repositories, query).slice(0, maxResults);
    render();
  }, debounceMs);

  input.addEventListener('input', update);

  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!matches.length) return;
      event.preventDefault();
      if (event.key === 'ArrowDown') {
        activeIndex = (activeIndex + 1) % matches.length;
      } else {
        activeIndex = activeIndex <= 0 ? matches.length - 1 : activeIndex - 1;
      }
      render();
    } else if (event.key === 'Enter') {
      if (activeIndex >= 0 && matches[activeIndex]) {
        event.preventDefault();
        choose(matches[activeIndex]);
      }
    } else if (event.key === 'Escape') {
      input.value = '';
      close();
    }
  });

  return { close };
}
