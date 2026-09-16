// Centralized error handling: classification, friendly messages and
// error page rendering with retry support.

import { escapeHtml } from './utils.js';
import { withBasePath } from './base-path.js';

const ERROR_INFO = {
  'not-found': {
    title: 'Repository or Report Not Found',
    suggestion: 'Check that the repository exists and contains a .refactorfirst/refactor-first.json file on the requested branch.'
  },
  'rate-limit': {
    title: 'Hosting Platform API Rate Limit Reached',
    suggestion: 'Too many requests were made to the hosting platform API. Please wait a few minutes and try again.'
  },
  'network': {
    title: 'Network Error',
    suggestion: 'Check your internet connection and try again.'
  },
  'template': {
    title: 'Report Template Error',
    suggestion: 'The report template could not be loaded or rendered. The repository may use an incompatible template.'
  },
  'api': {
    title: 'Hosting Platform API Error',
    suggestion: 'The hosting platform API returned an unexpected error. Please try again later.'
  },
  'general': {
    title: 'Something Went Wrong',
    suggestion: 'An unexpected error occurred. If it persists, please open an issue on GitHub.'
  }
};

const RECOVERABLE_TYPES = new Set(['rate-limit', 'network', 'api']);

export function classifyError(error) {
  const status = error && error.status;
  const message = (error && error.message) || '';

  if (status === 404 || message.includes('Repository not found') || message === 'Not Found') {
    return { type: 'not-found', status: status || 404 };
  }
  if (status === 403 || status === 429 || /rate limit/i.test(message)) {
    return { type: 'rate-limit', status };
  }
  if (error instanceof TypeError && /fetch|network/i.test(message)) {
    return { type: 'network', status };
  }
  if (message.includes('template')) {
    return { type: 'template', status };
  }
  if (typeof status === 'number' && status >= 400) {
    return { type: 'api', status };
  }
  return { type: 'general', status };
}

export function userMessageFor(type) {
  return ERROR_INFO[type] || ERROR_INFO.general;
}

// Build the error page markup for an error. `retry: true` adds a Retry
// button (a caller wires its click handler after insertion).
export function errorPageHtml(error, { retry = false } = {}) {
  const { type, status } = classifyError(error);
  const { title, suggestion } = userMessageFor(type);

  return `
    <section class="error-page error-${escapeHtml(type)}" role="alert" aria-live="assertive">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(suggestion)}</p>
      ${status ? `<p class="error-code">Error code: ${escapeHtml(String(status))}</p>` : ''}
      <div class="error-actions">
        ${retry ? '<button type="button" class="retry">Retry</button>' : ''}
        <a href="${escapeHtml(withBasePath('/'))}" data-link>Back to home</a>
      </div>
    </section>`;
}

// Render an error page into the container. onRetry adds a retry button
// for recoverable errors.
export function renderErrorPage(container, error, { onRetry } = {}) {
  const { type } = classifyError(error);
  const isRecoverable = RECOVERABLE_TYPES.has(type);
  container.innerHTML = errorPageHtml(error, { retry: isRecoverable && Boolean(onRetry) });

  const retryButton = container.querySelector('button.retry');
  if (retryButton && onRetry) {
    retryButton.addEventListener('click', onRetry);
  }
}

// Log errors to the console and to Sentry when it is available.
export function logError(error, context = {}) {
  console.error('[RefactorFirst]', error, context);
  if (typeof window !== 'undefined' && window.Sentry && typeof window.Sentry.captureException === 'function') {
    window.Sentry.captureException(error, { extra: context });
  }
}
