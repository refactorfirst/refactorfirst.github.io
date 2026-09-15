import { describe, it, expect } from 'bun:test';
import { parseRoute, getDefaultBranch } from '../../js/router.js';

describe('URL Routing', () => {
  it('should parse username and repository from URL', () => {
    const result = parseRoute('/refactorfirst/refactorfirst/main');
    expect(result.username).toBe('refactorfirst');
    expect(result.repository).toBe('refactorfirst');
    expect(result.branch).toBe('main');
  });

  it('should default to main branch when not specified', () => {
    const result = parseRoute('/refactorfirst/refactorfirst');
    expect(result.username).toBe('refactorfirst');
    expect(result.repository).toBe('refactorfirst');
    expect(result.branch).toBe('main');
  });

  it('should parse only username when repository not specified', () => {
    const result = parseRoute('/refactorfirst');
    expect(result.username).toBe('refactorfirst');
    expect(result.repository).toBeNull();
    expect(result.branch).toBe('main');
  });

  it('should return null for all parts when path is empty', () => {
    const result = parseRoute('/');
    expect(result.username).toBeNull();
    expect(result.repository).toBeNull();
    expect(result.branch).toBe('main');
  });

  it('should handle trailing slashes', () => {
    const result = parseRoute('/refactorfirst/refactorfirst/main/');
    expect(result.username).toBe('refactorfirst');
    expect(result.repository).toBe('refactorfirst');
    expect(result.branch).toBe('main');
  });

  it('should handle multiple trailing slashes', () => {
    const result = parseRoute('/refactorfirst/refactorfirst///');
    expect(result.username).toBe('refactorfirst');
    expect(result.repository).toBe('refactorfirst');
    expect(result.branch).toBe('main');
  });

  it('getDefaultBranch should return main as default', () => {
    expect(getDefaultBranch()).toBe('main');
  });
});