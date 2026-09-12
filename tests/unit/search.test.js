import { describe, it, expect, beforeEach } from 'bun:test';
import {
  parseRepositories,
  filterRepositories,
  debounce,
  createSearch
} from '../../js/search.js';

describe('parseRepositories', () => {
  it('parses one username/repository per line', () => {
    const repos = parseRepositories('refactorfirst/refactorfirst\napache/tomcat\n');
    expect(repos).toEqual([
      { username: 'refactorfirst', repository: 'refactorfirst', fullName: 'refactorfirst/refactorfirst' },
      { username: 'apache', repository: 'tomcat', fullName: 'apache/tomcat' }
    ]);
  });

  it('ignores blank lines, comments and malformed entries', () => {
    const repos = parseRepositories('\n# comment\nvalid/repo\nnotvalid\n\nowner//double\n');
    expect(repos).toEqual([
      { username: 'valid', repository: 'repo', fullName: 'valid/repo' }
    ]);
  });

  it('handles an empty file', () => {
    expect(parseRepositories('')).toEqual([]);
  });
});

describe('filterRepositories', () => {
  const repos = parseRepositories(
    'refactorfirst/refactorfirst\nspring-projects/spring-framework\nspring-projects/spring-boot\napache/tomcat'
  );

  it('matches case-insensitively against the full name', () => {
    const result = filterRepositories(repos, 'SPRING');
    expect(result.map(r => r.fullName)).toEqual([
      'spring-projects/spring-framework',
      'spring-projects/spring-boot'
    ]);
  });

  it('matches partial repository names', () => {
    const result = filterRepositories(repos, 'refactor');
    expect(result.map(r => r.fullName)).toEqual(['refactorfirst/refactorfirst']);
  });

  it('returns everything for an empty query', () => {
    expect(filterRepositories(repos, '')).toHaveLength(4);
  });

  it('returns nothing when nothing matches', () => {
    expect(filterRepositories(repos, 'zzz-no-match')).toEqual([]);
  });
});

describe('debounce', () => {
  it('delays invocation until the delay elapses', async () => {
    let calls = 0;
    const fn = debounce(() => { calls++; }, 20);
    fn();
    fn();
    fn();
    expect(calls).toBe(0);
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(calls).toBe(1);
  });
});

describe('createSearch (type-ahead behaviour)', () => {
  let input, results, navigations;
  const repos = parseRepositories('alice/alpha\nalice/beta\nbob/gamma');

  beforeEach(() => {
    document.body.innerHTML = `
      <input type="search" id="q">
      <ul id="results"></ul>`;
    input = document.getElementById('q');
    results = document.getElementById('results');
    navigations = [];
    createSearch({
      input,
      resultsList: results,
      repositories: repos,
      onNavigate: repo => navigations.push(repo.fullName),
      debounceMs: 0
    });
  });

  function type(value) {
    input.value = value;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  }

  function press(key) {
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }

  it('shows filtered suggestions as the user types', () => {
    type('alice');
    expect(results.children.length).toBe(2);
    expect(results.textContent).toContain('alice/alpha');
    expect(results.textContent).toContain('alice/beta');
    expect(results.hidden).toBe(false);
  });

  it('hides results when the query is empty', () => {
    type('alice');
    type('');
    expect(results.hidden).toBe(true);
    expect(results.children.length).toBe(0);
  });

  it('navigates on click of a suggestion', () => {
    type('gamma');
    results.querySelector('li').click();
    expect(navigations).toEqual(['bob/gamma']);
  });

  it('supports keyboard navigation with Enter', () => {
    type('alice');
    press('ArrowDown');
    press('ArrowDown');
    press('Enter');
    expect(navigations).toEqual(['alice/beta']);
  });

  it('wraps arrow navigation around the list', () => {
    type('alice');
    press('ArrowUp');
    press('Enter');
    expect(navigations).toEqual(['alice/beta']);
  });

  it('Escape clears and hides the results', () => {
    type('alice');
    press('Escape');
    expect(results.hidden).toBe(true);
    expect(input.value).toBe('');
  });

  it('marks options as selectable for screen readers', () => {
    type('alice');
    const option = results.querySelector('li');
    expect(option.getAttribute('role')).toBe('option');
  });
});
