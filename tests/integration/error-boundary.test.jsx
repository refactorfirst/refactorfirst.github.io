// Phase 7: route error boundaries render the same mapped copy as the legacy
// inline error pages (via lib/error-handler) and offer a working Retry.
import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { mock } from 'bun:test';

mock.module('next/navigation', () => ({
  usePathname: () => '/boom',
  useRouter: () => ({ push: () => {} }),
  useSearchParams: () => new URLSearchParams('')
}));

import { render, fireEvent, cleanup, installRtlDom } from './rtl';
import { jsx as _jsx } from 'react/jsx-runtime';
import ErrorBoundaryView from '../../components/error-boundary-view';
import GlobalError from '../../app/error';
import UsernameError from '../../app/[username]/error';
import RepositoryError from '../../app/[username]/[repository]/error';

installRtlDom();

describe('error boundaries', () => {
  let consoleError;
  beforeEach(() => {
    consoleError = spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleError.mockRestore();
    cleanup();
  });

  test('maps errors through lib/error-handler (rate-limit copy for 429)', () => {
    const error = new Error('rate limit exceeded');
    error.status = 429;
    const { container } = render(_jsx(ErrorBoundaryView, { error, reset: () => {} }));
    expect(container.textContent).toContain('Rate Limit');
    expect(container.querySelector('.error-rate-limit')).toBeTruthy();
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
  });

  test('general errors get the generic copy plus a working Retry', () => {
    const error = new Error('boom');
    let resets = 0;
    const { container } = render(_jsx(ErrorBoundaryView, { error, reset: () => resets++ }));
    expect(container.textContent).toContain('Something Went Wrong');
    fireEvent.click(container.querySelector('button'));
    expect(resets).toBe(1);
  });

  test('the boundary logs the error via logError', () => {
    const error = new Error('boom');
    render(_jsx(ErrorBoundaryView, { error, reset: () => {} }));
    expect(consoleError.mock.calls.length).toBeGreaterThan(0);
    expect(consoleError.mock.calls[0][0]).toBe('[RefactorFirst]');
    expect(consoleError.mock.calls[0][1].message).toBe('boom');
  });

  test('all three route boundaries delegate to the shared view', () => {
    for (const Boundary of [GlobalError, UsernameError, RepositoryError]) {
      const { container, unmount } = render(_jsx(Boundary, { error: new Error('x'), reset: () => {} }));
      expect(container.querySelector('.error-page')).toBeTruthy();
      unmount();
    }
  });
});
