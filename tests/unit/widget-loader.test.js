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
    const unsubscribe = onWidgetReady('vizdom', () => calls.push('late'));
    expect(calls).toEqual(['late']);
    expect(unsubscribe).toBeTypeOf('function');
    unsubscribe();
    expect(calls).toEqual(['late']);
  });

  it('unsubscribes only the cancelled callback and tolerates repeated cleanup', () => {
    const calls = [];
    const unsubscribe = onWidgetReady('chart', () => calls.push('cancelled'));
    onWidgetReady('chart', () => calls.push('active'));
    unsubscribe();
    unsubscribe();
    markWidgetReady('chart');
    unsubscribe();
    expect(calls).toEqual(['active']);
  });

  it('allows a fresh registration after the last pending callback is removed', () => {
    const calls = [];
    const unsubscribe = onWidgetReady('chart', () => calls.push('cancelled'));
    unsubscribe();
    onWidgetReady('chart', () => calls.push('fresh'));
    unsubscribe();
    markWidgetReady('chart');
    expect(calls).toEqual(['fresh']);
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
