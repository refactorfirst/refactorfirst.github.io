// Rate limiting: track hosting platform API limits via response headers and
// prevent abuse of the repository submission form.

export class ApiRateLimiter {
  constructor() {
    this.remainingCount = null;
    this.resetEpochSeconds = null;
  }

  // Record X-RateLimit-* style headers from a hosting platform API response.
  recordResponse({ remaining, resetEpochSeconds }) {
    this.remainingCount = remaining;
    this.resetEpochSeconds = resetEpochSeconds;
  }

  remaining() {
    return this.remainingCount;
  }

  resetTime() {
    return this.resetEpochSeconds;
  }

  canMakeRequest() {
    if (this.remainingCount === null || this.remainingCount > 0) {
      return true;
    }
    // Exhausted - only allow once the reset window has passed.
    return Date.now() / 1000 >= this.resetEpochSeconds;
  }

  secondsUntilReset() {
    if (this.resetEpochSeconds === null) return 0;
    return Math.max(0, Math.ceil(this.resetEpochSeconds - Date.now() / 1000));
  }
}

// Sliding-window limiter for repository submissions (default 5/hour/user).
export class SubmissionRateLimiter {
  constructor({ maxPerWindow = 5, windowMs = 3600000 } = {}) {
    this.maxPerWindow = maxPerWindow;
    this.windowMs = windowMs;
    this.timestamps = new Map();
  }

  #prune(username, now) {
    const attempts = (this.timestamps.get(username) || [])
      .filter(ts => now - ts < this.windowMs);
    this.timestamps.set(username, attempts);
    return attempts;
  }

  tryAcquire(username, now = Date.now()) {
    const attempts = this.#prune(username, now);
    if (attempts.length >= this.maxPerWindow) {
      return false;
    }
    attempts.push(now);
    return true;
  }

  remainingFor(username, now = Date.now()) {
    return this.maxPerWindow - this.#prune(username, now).length;
  }
}
