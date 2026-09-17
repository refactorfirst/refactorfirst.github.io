// Widget readiness registry used by ReportView to coordinate CDN widgets
// (next/script onLoad handlers + public/widgets/* module bridges).
import { describe, it, expect, beforeEach } from 'bun:test';
import {
  onWidgetReady,
  markWidgetReady,
  isWidgetReady,
  resetWidgetRegistry
} from '../../lib/widget-loader.js';

describe('widget-loader', () => {
  beforeEach(() => resetWidgetRegistry());

  it('fires callbacks registered before the mark', () => {
    const calls = [];
    onWidgetReady('Chart', () => calls.push('a'));
    onWidgetReady('Chart', () => calls.push('b'));
    markWidgetReady('Chart');
    expect(calls).toEqual(['a', 'b']);
  });

  it('invokes callbacks registered after the mark immediately', () => {
    markWidgetReady('vizdom');
    const calls = [];
    onWidgetReady('vizdom', () => calls.push('late'));
    expect(calls).toEqual(['late']);
  });

  it('tracks readiness state per widget', () => {
    expect(isWidgetReady('Chart')).toBe(false);
    markWidgetReady('Chart');
    expect(isWidgetReady('Chart')).toBe(true);
    expect(isWidgetReady('vizdom')).toBe(false);
  });

  it('marks a widget only once (duplicate marks are ignored)', () => {
    const calls = [];
    onWidgetReady('sigma', () => calls.push(1));
    markWidgetReady('sigma');
    markWidgetReady('sigma');
    expect(calls).toEqual([1]);
  });

  it('resetWidgetRegistry clears state for tests', () => {
    markWidgetReady('Chart');
    resetWidgetRegistry();
    expect(isWidgetReady('Chart')).toBe(false);
  });
});
