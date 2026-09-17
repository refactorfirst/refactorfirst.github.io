import { describe, it, expect } from 'bun:test';
import {
  detectHostingEnvironment,
  detectFromHostname,
  resolveHostingEnvironment,
  readMetaTag,
  getSubmissionTarget,
  getPlatformBaseUrl
} from '../../lib/host.js';

describe('detectHostingEnvironment', () => {
  it('detects github.io Pages hosts as github', () => {
    expect(detectHostingEnvironment('refactorfirst.github.io')).toBe('github');
    expect(detectHostingEnvironment('my-org.github.io')).toBe('github');
  });

  it('detects gitlab.io Pages hosts as gitlab', () => {
    expect(detectHostingEnvironment('group.gitlab.io')).toBe('gitlab');
    expect(detectHostingEnvironment('sub.group.gitlab.io')).toBe('gitlab');
  });

  it('detects bitbucket.io sites as bitbucket', () => {
    expect(detectHostingEnvironment('team.bitbucket.io')).toBe('bitbucket');
  });

  it('treats github.com and github enterprise domains as github', () => {
    expect(detectHostingEnvironment('github.com')).toBe('github');
    expect(detectHostingEnvironment('github.my-corp.example.com')).toBe('github');
  });

  it('treats self-hosted gitlab/bitbucket hosts by keyword', () => {
    expect(detectHostingEnvironment('gitlab.example.com')).toBe('gitlab');
    expect(detectHostingEnvironment('bitbucket.example.org')).toBe('bitbucket');
  });

  it('defaults unknown and local hosts to github', () => {
    expect(detectHostingEnvironment('localhost')).toBe('github');
    expect(detectHostingEnvironment('127.0.0.1')).toBe('github');
    expect(detectHostingEnvironment('reports.example.com')).toBe('github');
    expect(detectHostingEnvironment('')).toBe('github');
  });

  it('respects explicit platform setting over hostname detection', () => {
    expect(detectHostingEnvironment('localhost', 'gitlab')).toBe('gitlab');
    expect(detectHostingEnvironment('my-custom-domain.com', 'bitbucket')).toBe('bitbucket');
    expect(detectHostingEnvironment('gitlab.example.com', 'github')).toBe('github');
  });

  it('respects a platform meta tag over everything else', () => {
    document.head.innerHTML = '<meta name="platform" content="gitlab">';
    try {
      expect(detectHostingEnvironment('something.github.io')).toBe('gitlab');
    } finally {
      document.head.innerHTML = '';
    }
  });
});

// SSR-context behavior (Technical Appendix §8): the pure resolver receives
// the env var; the wrapper falls back to it when no meta/explicit wins.
describe('detectHostingEnvironment SSR / env var support', () => {
  function withEnvVar(value, fn) {
    const previous = process.env.NEXT_PUBLIC_HOSTING_ENVIRONMENT;
    if (value === undefined) delete process.env.NEXT_PUBLIC_HOSTING_ENVIRONMENT;
    else process.env.NEXT_PUBLIC_HOSTING_ENVIRONMENT = value;
    try { fn(); } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_HOSTING_ENVIRONMENT;
      else process.env.NEXT_PUBLIC_HOSTING_ENVIRONMENT = previous;
    }
  }

  it('SSR context returns the env var value', () => {
    withEnvVar('gitlab', () => {
      expect(resolveHostingEnvironment({ env: process.env.NEXT_PUBLIC_HOSTING_ENVIRONMENT })).toBe('gitlab');
      expect(detectHostingEnvironment('localhost')).toBe('gitlab');
    });
  });

  it('client context falls back to hostname detection when no env var is set', () => {
    withEnvVar(undefined, () => {
      expect(detectHostingEnvironment('group.gitlab.io')).toBe('gitlab');
    });
  });

  it('missing env var defaults to github for unknown hosts', () => {
    withEnvVar(undefined, () => {
      expect(resolveHostingEnvironment({ env: undefined, hostname: '' })).toBe('github');
      expect(detectHostingEnvironment('')).toBe('github');
    });
  });

  it('explicit parameter still wins over the env var', () => {
    withEnvVar('bitbucket', () => {
      expect(detectHostingEnvironment('localhost', 'gitlab')).toBe('gitlab');
    });
  });

  it('ignores invalid env var values', () => {
    withEnvVar('not-a-platform', () => {
      expect(detectHostingEnvironment('wiki.gitlab.io')).toBe('gitlab');
    });
  });
});

describe('deployment config readers', () => {
  it('getSubmissionTarget prefers the env var, then the meta reader', () => {
    const previous = process.env.NEXT_PUBLIC_SUBMISSION_TARGET;
    process.env.NEXT_PUBLIC_SUBMISSION_TARGET = 'env-owner/env-repo';
    try {
      expect(getSubmissionTarget(() => 'meta-owner/meta-repo')).toBe('env-owner/env-repo');
      delete process.env.NEXT_PUBLIC_SUBMISSION_TARGET;
      expect(getSubmissionTarget(() => 'meta-owner/meta-repo')).toBe('meta-owner/meta-repo');
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SUBMISSION_TARGET;
      else process.env.NEXT_PUBLIC_SUBMISSION_TARGET = previous;
    }
  });

  it('getPlatformBaseUrl prefers the env var, then the meta reader', () => {
    const previous = process.env.NEXT_PUBLIC_PLATFORM_BASE_URL;
    process.env.NEXT_PUBLIC_PLATFORM_BASE_URL = 'https://gitlab.internal';
    try {
      expect(getPlatformBaseUrl(() => 'https://gitlab.example.org')).toBe('https://gitlab.internal');
      delete process.env.NEXT_PUBLIC_PLATFORM_BASE_URL;
      expect(getPlatformBaseUrl(() => 'https://gitlab.example.org')).toBe('https://gitlab.example.org');
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_PLATFORM_BASE_URL;
      else process.env.NEXT_PUBLIC_PLATFORM_BASE_URL = previous;
    }
  });
});

describe('detectFromHostname / readMetaTag', () => {
  it('is case-insensitive', () => {
    expect(detectFromHostname('GROUP.GITLAB.IO')).toBe('gitlab');
    expect(detectFromHostname('Team.Bitbucket.IO')).toBe('bitbucket');
  });

  it('readMetaTag reads meta content and tolerates absence', () => {
    document.head.innerHTML = '<meta name="submission-target" content=" a/b ">';
    try {
      expect(readMetaTag('submission-target')).toBe('a/b');
      expect(readMetaTag('platform-base-url')).toBeUndefined();
    } finally {
      document.head.innerHTML = '';
    }
  });
});
