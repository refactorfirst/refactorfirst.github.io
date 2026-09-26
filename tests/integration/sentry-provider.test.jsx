// Phase 7: Sentry init is a no-op without a DSN and never throws during
// prerender; with a DSN the vendored bridge script is what loads the SDK.
import { describe, test, expect, afterEach } from 'bun:test';
import { mock } from 'bun:test';
import { renderToString } from 'react-dom/server';

const lastScriptProps = [];
mock.module('next/script', () => ({
  default: props => {
    lastScriptProps.push({ src: props.src, type: props.type });
    return null;
  }
}));
import { sharedNextNavigationMock } from './next-navigation-stub';

mock.module('next/navigation', () => sharedNextNavigationMock());

import { createElement as h } from 'react';
import SentryProvider from '../../components/sentry-provider';

describe('SentryProvider', () => {
  afterEach(() => {
    lastScriptProps.length = 0;
  });

  test('renders the vendored module bridge script', () => {
    renderToString(h(SentryProvider));
    expect(lastScriptProps.length).toBe(1);
    expect(lastScriptProps[0].src).toBe('/widgets/sentry-bridge.js');
    expect(lastScriptProps[0].type).toBe('module');
  });

  test('prerender does not throw without window/DSN (server render)', () => {
    expect(() => renderToString(h(SentryProvider))).not.toThrow();
  });

  test('the bridge file is a no-op without a sentry-dsn meta tag', async () => {
    // jsdom is available under Bun; importing the bridge exercises the
    // DSN-missing branch synchronously without any CDN request.
    document.querySelectorAll('meta[name="sentry-dsn"]').forEach(m => m.remove());
    await import('../../public/widgets/sentry-bridge.js');
    expect(window.Sentry).toBeUndefined();
  });
});
