// Browser-global side of lib/widget-loader.js: the module bridges in
// public/widgets/ report readiness through window.__rfMarkWidgetReady.
// DOM-dependent, so it lives in tests/integration (RTL/jsdom environment).
import { describe, it, expect, beforeEach } from 'bun:test';
import { installRtlDom } from './rtl';
import {
  isWidgetReady,
  resetWidgetRegistry
} from '../../lib/widget-loader.js';

installRtlDom();

describe('widget-loader window bridge', () => {
  beforeEach(() => resetWidgetRegistry());

  it('exposes __rfMarkWidgetReady on window for module bridges', () => {
    expect(typeof window.__rfMarkWidgetReady).toBe('function');
    window.__rfMarkWidgetReady('vizdom');
    expect(isWidgetReady('vizdom')).toBe(true);
  });
});
