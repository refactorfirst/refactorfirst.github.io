import { describe, it, expect, beforeEach } from 'bun:test';
import { ApiRateLimiter, SubmissionRateLimiter } from '../../js/rate-limiter.js';

describe('ApiRateLimiter (hosting platform rate limit headers)', () => {
  let limiter;
  beforeEach(() => { limiter = new ApiRateLimiter(); });

  it('allows requests when nothing is known about limits', () => {
    expect(limiter.canMakeRequest()).toBe(true);
  });

  it('parses rate limit headers from a response', () => {
    limiter.recordResponse({ remaining: 42, resetEpochSeconds: 1893456000 });
    expect(limiter.remaining()).toBe(42);
    expect(limiter.resetTime()).toBe(1893456000);
    expect(limiter.canMakeRequest()).toBe(true);
  });

  it('blocks requests when the limit is exhausted and reset is in the future', () => {
    limiter.recordResponse({ remaining: 0, resetEpochSeconds: Date.now() / 1000 + 600 });
    expect(limiter.canMakeRequest()).toBe(false);
  });

  it('allows requests again once the reset time has passed', () => {
    limiter.recordResponse({ remaining: 0, resetEpochSeconds: Date.now() / 1000 - 10 });
    expect(limiter.canMakeRequest()).toBe(true);
  });

  it('reports seconds until reset', () => {
    limiter.recordResponse({ remaining: 0, resetEpochSeconds: Date.now() / 1000 + 90 });
    expect(limiter.secondsUntilReset()).toBeGreaterThan(0);
    expect(limiter.secondsUntilReset()).toBeLessThanOrEqual(90);
  });
});

describe('SubmissionRateLimiter (abuse prevention, 5/hour per user)', () => {
  let limiter;
  beforeEach(() => { limiter = new SubmissionRateLimiter({ maxPerWindow: 5, windowMs: 3600000 }); });

  it('allows up to the max submissions per window', () => {
    for (let i = 0; i < 5; i++) {
      expect(limiter.tryAcquire('alice')).toBe(true);
    }
    expect(limiter.tryAcquire('alice')).toBe(false);
  });

  it('tracks users independently', () => {
    for (let i = 0; i < 5; i++) limiter.tryAcquire('alice');
    expect(limiter.tryAcquire('bob')).toBe(true);
  });

  it('reports remaining submissions', () => {
    limiter.tryAcquire('alice');
    limiter.tryAcquire('alice');
    expect(limiter.remainingFor('alice')).toBe(3);
  });

  it('frees capacity after the window expires', () => {
    const shortLimiter = new SubmissionRateLimiter({ maxPerWindow: 1, windowMs: 10 });
    expect(shortLimiter.tryAcquire('alice')).toBe(true);
    expect(shortLimiter.tryAcquire('alice')).toBe(false);
    return new Promise(resolve => setTimeout(() => {
      expect(shortLimiter.tryAcquire('alice')).toBe(true);
      resolve();
    }, 20));
  });
});
