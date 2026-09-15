import { describe, it, expect, beforeEach } from 'bun:test';
import {
  classifyError,
  userMessageFor,
  renderErrorPage
} from '../../js/error-handler.js';

describe('classifyError', () => {
  it('classifies 404s as not-found', () => {
    expect(classifyError(new Error('Repository not found')).type).toBe('not-found');
    expect(classifyError({ status: 404 }).type).toBe('not-found');
  });

  it('classifies 403/429 as rate-limit', () => {
    expect(classifyError({ status: 403 }).type).toBe('rate-limit');
    expect(classifyError({ status: 429 }).type).toBe('rate-limit');
  });

  it('classifies network failures', () => {
    expect(classifyError(new TypeError('Failed to fetch')).type).toBe('network');
  });

  it('classifies template errors', () => {
    expect(classifyError(new Error('Failed to fetch template: 500')).type).toBe('template');
  });

  it('classifies other API errors', () => {
    expect(classifyError({ status: 500 }).type).toBe('api');
  });

  it('falls back to a general error', () => {
    expect(classifyError(new Error('mystery')).type).toBe('general');
  });
});

describe('userMessageFor', () => {
  it('provides a friendly message and suggestion for every error type', () => {
    for (const type of ['not-found', 'rate-limit', 'network', 'template', 'api', 'general']) {
      const message = userMessageFor(type);
      expect(message.title.length).toBeGreaterThan(0);
      expect(message.suggestion.length).toBeGreaterThan(0);
    }
  });

  it('suggests checking the repository for not-found errors', () => {
    expect(userMessageFor('not-found').suggestion.toLowerCase()).toContain('repository');
  });
});

describe('renderErrorPage', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
  });

  it('renders the error title, message and a way home', () => {
    const container = document.getElementById('app');
    renderErrorPage(container, new Error('Repository not found'));
    expect(container.querySelector('h1').textContent).toContain('Not Found');
    expect(container.querySelector('a[href="/"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('includes a retry button for recoverable errors', () => {
    const container = document.getElementById('app');
    let retried = false;
    renderErrorPage(container, { status: 429 }, { onRetry: () => { retried = true; } });
    const button = container.querySelector('button.retry');
    expect(button).not.toBeNull();
    button.click();
    expect(retried).toBe(true);
  });

  it('renders an error code for support reference', () => {
    const container = document.getElementById('app');
    renderErrorPage(container, { status: 500 });
    expect(container.querySelector('.error-code').textContent).toContain('500');
  });
});
