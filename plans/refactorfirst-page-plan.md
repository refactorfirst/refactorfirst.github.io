# RefactorFirst GitHub Pages Application Plan

## Implementation TODO List

### CRITICAL TDD REQUIREMENTS
- [x] **MANDATORY**: Write failing unit tests BEFORE writing any production code
- [x] **MANDATORY**: Refactor code continuously to improve quality and maintainability
- [x] Follow Red-Green-Refactor cycle for all features
- [x] Ensure all tests pass before committing code
- [x] Never skip writing tests for new functionality

### Phase 1: Core Infrastructure
- [x] Set up testing infrastructure (Bun, Playwright, package.json)
- [x] Set up basic HTML structure with top menu (TDD approach - failing tests first)
- [x] Implement URL routing system (TDD approach - failing tests first)
- [x] Create repository data file (`../repositories.txt`)
- [x] Set up local testing workflow
- [ ] Register GitHub OAuth App and configure secrets *(external: requires GitHub org admin access)*

### Phase 2: Landing & Search
- [x] Design and implement landing page (TDD approach - failing tests first)
- [x] Implement type-ahead search bar (TDD approach - failing tests first)
- [x] Create user repository listing page (TDD approach - failing tests first)
- [x] Add pagination for repository lists (TDD approach - failing tests first)
- [x] Implement GitHub OAuth authentication flow (TDD approach - failing tests first)
- [x] Implement "Add My Repo" button and submission form (TDD approach - failing tests first)
- [x] Set up GitHub Actions workflow for repository validation
- [x] Configure scheduled redeployment workflow

### Phase 3: Report Rendering
- [x] Implement GitHub raw content fetching (TDD approach - failing tests first)
- [x] Integrate Mustache.js rendering (TDD approach - failing tests first)
- [x] Add branch fallback logic (TDD approach - failing tests first)
- [x] Implement error handling and loading states (TDD approach - failing tests first)

### Phase 4: Additional Pages
- [x] Create About page (TDD approach - failing tests first)
- [x] Create Feedback page (TDD approach - failing tests first)
- [x] Create Getting Started page (TDD approach - failing tests first)
- [x] Create Documentation page (TDD approach - failing tests first)
- [x] Create FAQ page (TDD approach - failing tests first)
- [x] Create Examples gallery page (TDD approach - failing tests first)
- [x] Create API documentation page (TDD approach - failing tests first)

### Phase 5: Polish & Optimization
- [x] Responsive design improvements (TDD approach - failing tests first)
- [x] Performance optimization (TDD approach - failing tests first)
- [x] Accessibility improvements (TDD approach - failing tests first)
- [x] Error page enhancements (TDD approach - failing tests first)
- [x] Cross-browser testing with Playwright
- [x] Mobile responsiveness testing with Playwright

### GitHub Actions Workflows
- [x] Create add-repository.yml workflow
- [x] Create redeploy.yml workflow
- [ ] Test workflow execution and error handling *(requires push to GitHub)*
- [x] Create user-provided workflow template

### Security & Authentication
- [x] Implement GitHub OAuth flow with PKCE
- [ ] Set up OAuth app registration and secrets *(external: requires GitHub org admin access)*
- [x] Implement CSRF protection for OAuth
- [x] Add input validation and sanitization
- [x] Implement rate limiting for submissions
- [x] Add audit logging for repository additions
- [x] Implement Content Security Policy headers
- [x] Add GitHub API rate limiting handling
- [ ] Create OAuth security audit plan *(post-deployment activity)*

### Testing & Deployment
- [x] Test local development workflow
- [ ] Test GitHub OAuth authentication *(requires a registered OAuth app)*
- [x] Test repository submission flow
- [ ] Test GitHub Actions workflows *(requires push to GitHub)*
- [ ] Deploy to GitHub Pages *(external)*
- [ ] Test production deployment *(external)*
- [ ] Monitor for issues and bugs *(post-deployment activity)*

### Documentation
- [x] Update Getting Started guide with OAuth instructions
- [x] Update FAQ with OAuth-related questions
- [ ] Create GitHub OAuth setup guide *(folded into Getting Started; dedicated guide outstanding)*
- [x] Document GitHub Actions workflows
- [x] Create troubleshooting guide

### Risk Mitigation (High Priority)
- [x] Implement GitHub API rate limiting strategy
- [x] Design comprehensive error pages
- [x] Set up monitoring (Sentry, performance monitoring)
- [ ] Create backup strategy for critical data *(not implemented)*
- [x] Implement abuse prevention mechanisms
- [ ] Conduct security audit for OAuth and workflows *(post-deployment activity)*

### Risk Mitigation (Medium Priority)
- [ ] Define performance budgets and monitoring
- [ ] Implement accessibility testing (WCAG 2.1 AA) *(basic ARIA/keyboard support done; axe-core audit outstanding)*
- [ ] Create CDN fallback strategy
- [x] Analyze test coverage for error paths

### Risk Mitigation (Low Priority)
- [ ] Implement user analytics
- [x] Create legal documentation (privacy policy, terms)
- [ ] Establish community management guidelines
- [ ] Add international character support
- [ ] Evaluate PWA capabilities

### Testing Setup
- [x] Set up Bun for unit testing
- [x] Set up Playwright configuration for E2E testing
- [x] Create test fixtures and sample data
- [x] Configure test scripts in package.json
- [ ] Set up pre-commit hooks for testing *(no git repo/husky configured)*
- [x] Configure CI/CD test workflow (Bun + Node.js for Playwright)

### Test Implementation
- [x] Write unit tests for router.js
- [x] Write unit tests for fetcher.js
- [x] Write unit tests for renderer.js
- [x] Write unit tests for search.js
- [x] Write unit tests for repo-submission.js
- [x] Write unit tests for oauth-handler.js
- [x] Write unit tests for error-handler.js
- [x] Write unit tests for rate-limiter.js
- [x] Write unit tests for cache-manager.js
- [x] Write unit tests for utils.js
- [x] Write integration tests for search flow
- [x] Write integration tests for submission flow
- [x] Write integration tests for report rendering
- [x] Write integration tests for OAuth flow
- [x] Write integration tests for error handling
- [x] Write E2E tests for user journeys
- [x] Write E2E tests for error page flows

## Critical Analysis: Potential Failure Points

### Architecture & Technical Risks

#### 1. GitHub API Rate Limiting
- **Risk**: Client-side GitHub API calls can hit rate limits (5000/hour authenticated, 60/hour unauthenticated)
- **Impact**: Users could experience rate limiting during submission or report viewing
- **Mitigation Implemented**: ✅ Client-side caching, rate limit headers handling, exponential backoff, graceful degradation added to Security Considerations
- **Status**: Mitigated in plan

#### 2. OAuth Implementation Complexity
- **Risk**: GitHub OAuth requires server-side components for token exchange in standard implementations
- **Impact**: Client-side-only OAuth may be more complex or insecure than planned
- **Mitigation Implemented**: ✅ PKCE implementation, short-lived tokens, regular security audits, token rotation added to Security Considerations
- **Status**: Mitigated in plan

#### 3. GitHub Pages Deployment Limitations
- **Risk**: GitHub Pages has build time limits (10 minutes) and size limits (1GB)
- **Impact**: Large `../repositories.txt` files or complex builds could fail
- **Mitigation Implemented**: ⚠️ Build time monitoring mentioned but no specific strategy
- **Status**: Partially mitigated - needs monitoring implementation

#### 4. Cross-Origin Resource Sharing (CORS)
- **Risk**: GitHub raw content supports CORS, but GitHub API may have restrictions
- **Impact**: Some API calls may fail due to CORS policies
- **Mitigation Implemented**: ⚠️ Not specifically addressed in current plan
- **Status**: Needs CORS testing strategy

### Feature & UX Risks

#### 5. Repository Validation Scalability
- **Risk**: As repository count grows, validation time increases
- **Impact**: Submission process becomes slow, user experience degrades
- **Mitigation Implemented**: ⚠️ Abuse prevention added but no specific performance targets
- **Status**: Partially mitigated - needs performance benchmarks

#### 6. Search Performance with Large Datasets
- **Risk**: Type-ahead search with thousands of repositories becomes slow
- **Impact**: Poor user experience, abandoned searches
- **Mitigation Implemented**: ⚠️ Debouncing mentioned but no comprehensive optimization strategy
- **Status**: Partially mitigated - needs performance benchmarks

#### 7. Mustache Template Compatibility
- **Risk**: Different repositories may use incompatible Mustache template versions
- **Impact**: Report rendering fails, inconsistent UI across repositories
- **Mitigation Implemented**: ✅ Template compatibility validation added to Phase 3
- **Status**: Mitigated in plan

#### 8. Branch Fallback Logic Complexity
- **Risk**: Complex branch fallback logic may have edge cases and failures
- **Impact**: Users get incorrect reports or error messages
- **Mitigation Implemented**: ⚠️ Testing mentioned but no detailed edge case analysis
- **Status**: Partially mitigated - needs comprehensive edge case testing

### Security Risks

#### 9. OAuth Token Security
- **Risk**: Client-side OAuth tokens stored in sessionStorage could be vulnerable to XSS
- **Impact**: Token theft, unauthorized repository submissions
- **Mitigation Implemented**: ✅ Content Security Policy, short-lived tokens, regular security audits added
- **Status**: Mitigated in plan

#### 10. Repository Submission Abuse
- **Risk**: Malicious users could spam submissions or submit inappropriate repositories
- **Impact**: Repository listing becomes polluted, system resources wasted
- **Mitigation Implemented**: ✅ Rate limiting (5/hour per user), content moderation, audit logging added
- **Status**: Mitigated in plan

#### 11. GitHub Actions Workflow Security
- **Risk**: GitHub Actions workflow has write access and could be exploited
- **Impact**: Unauthorized changes to `../repositories.txt`, system compromise
- **Mitigation Implemented**: ✅ Input validation, audit logging, security reviews added
- **Status**: Mitigated in plan

### Data & Reliability Risks

#### 12. Single Point of Failure - repositories.txt
- **Risk**: `../repositories.txt` is a single file that could become corrupted
- **Impact**: All repository listings become unavailable
- **Mitigation Implemented**: ✅ Backup strategy, automated backups, recovery procedures added
- **Status**: Mitigated in plan

#### 13. Dependency Management for CDNs
- **Risk**: CDN dependencies (Mustache.js, Chart.js, etc.) could break or become unavailable
- **Impact**: Application completely fails to render reports
- **Mitigation Implemented**: ✅ CDN fallback strategy, health monitoring, version pinning added
- **Status**: Mitigated in plan

#### 14. GitHub Raw Content Availability
- **Risk**: GitHub raw content URLs could change or be deprecated
- **Impact**: All report fetching fails
- **Mitigation Implemented**: ⚠️ Not specifically addressed
- **Status**: Needs GitHub API change monitoring strategy

### Testing & Quality Risks

#### 15. E2E Test Flakiness
- **Risk**: Playwright tests may be flaky due to timing issues, network dependencies
- **Impact**: Unreliable CI/CD, false negatives in testing
- **Mitigation Implemented**: ⚠️ Test reliability targets mentioned but no specific flaky test prevention
- **Status**: Partially mitigated - needs retry logic implementation

#### 16. Bun Compatibility Issues
- **Risk**: Bun is newer and may have compatibility issues with some dependencies
- **Impact**: Testing infrastructure fails, development blocked
- **Mitigation Implemented**: ⚠️ Node.js fallback mentioned but no compatibility testing plan
- **Status**: Partially mitigated - needs compatibility testing strategy

#### 17. Missing Test Coverage Areas
- **Risk**: Critical error paths and edge cases may not have test coverage
- **Impact**: Bugs in production, poor user experience
- **Mitigation Implemented**: ✅ Error path test coverage analysis added to Phase 5
- **Status**: Mitigated in plan

### Deployment & Operations Risks

#### 18. CI/CD Pipeline Complexity
- **Risk**: Hybrid Bun + Node.js CI/CD setup may have integration issues
- **Impact**: Deployment failures, blocked releases
- **Mitigation Implemented**: ⚠️ CI/CD testing mentioned but no detailed strategy
- **Status**: Partially mitigated - needs thorough pipeline testing

#### 19. GitHub OAuth App Maintenance
- **Risk**: OAuth app requires ongoing maintenance, secret rotation, monitoring
- **Impact**: Authentication failures, security vulnerabilities
- **Mitigation Implemented**: ✅ Quarterly secret rotation, regular monitoring added to Maintenance
- **Status**: Mitigated in plan

#### 20. 10-Minute Deployment Delay
- **Risk**: 10-minute deployment delay may frustrate users expecting immediate results
- **Impact**: Poor user experience, support requests
- **Mitigation Implemented**: ⚠️ User communication mentioned but no specific progress indicators
- **Status**: Partially mitigated - needs progress feedback system

### Remaining Risks Requiring Attention

#### High Priority Remaining Risks
1. **GitHub Pages Build Time Monitoring** - No specific monitoring strategy
2. **CORS Testing Strategy** - No comprehensive CORS fallback mechanisms
3. **Search Performance Benchmarks** - No specific optimization targets
4. **Branch Fallback Edge Cases** - Needs comprehensive edge case analysis
5. **GitHub API Change Monitoring** - No alternative data source strategy
6. **Flaky Test Prevention** - No retry logic implementation
7. **Bun Compatibility Testing** - No fallback strategy or version pinning
8. **CI/CD Pipeline Testing** - No detailed testing strategy
9. **Deployment Progress Feedback** - No user communication system

#### Medium Priority Remaining Risks
10. **Repository Validation Performance Targets** - No specific benchmarks
11. **PWA Evaluation** - Considered but not implemented in initial phases
12. **Advanced Analytics** - Basic analytics planned but no detailed strategy

### Summary of Risk Mitigation
- **Fully Mitigated**: 8 risks (40%)
- **Partially Mitigated**: 9 risks (45%)
- **Unaddressed**: 3 risks (15%)

The plan now addresses most critical security and operational risks, with remaining items primarily around performance optimization and advanced features that can be addressed post-launch.

## Recommended Remaining Actions

### High Priority (Address During Implementation)
1. **Add CORS Testing Strategy**: Test all API endpoints for CORS, implement fallback mechanisms
2. **Define Search Performance Benchmarks**: Set specific targets and optimization strategies
3. **Comprehensive Branch Fallback Testing**: Detailed edge case analysis and test coverage
4. **Implement Flaky Test Prevention**: Add retry logic and test isolation for E2E tests
5. **Bun Compatibility Testing Plan**: Test compatibility early, establish fallback strategy
6. **CI/CD Pipeline Testing Strategy**: Thorough testing of hybrid Bun + Node.js setup
7. **Deployment Progress Feedback System**: Clear user communication and progress indicators

### Medium Priority (Address Post-Launch)
8. **GitHub Pages Build Time Monitoring**: Implement build time tracking and alerts
9. **GitHub API Change Monitoring**: Set up monitoring for API deprecations and changes
10. **Repository Validation Performance Targets**: Define and monitor performance benchmarks
11. **Advanced Analytics Strategy**: Detailed user analytics and feature adoption tracking

### Low Priority (Future Enhancements)
12. **PWA Implementation**: Evaluate and implement progressive web app capabilities
13. **Advanced Monitoring**: Enhanced observability and alerting systems

## TDD Approach

### Testing Philosophy
- **Test-Driven Development (TDD)**: Write tests before implementation code
- **Red-Green-Refactor cycle**: Write failing test, make it pass, refactor
- **CRITICAL REQUIREMENT**: Failing unit tests MUST be written before any production code is written
- **Continuous Refactoring**: Code should be refactored whenever possible to improve quality, maintainability, and performance
- **Client-side only**: No server-side testing frameworks or Node.js backend testing
- **Browser-native testing**: Test in realistic browser environments when possible
- **Fast feedback loop**: Quick test execution for rapid development
- **Performance-first**: Use Bun for fastest unit test execution (5-20x faster than alternatives)
- **Stability-first**: Use Playwright with Node.js for reliable E2E browser testing

### Testing Framework Selection
- **Unit Testing**: Bun's built-in test runner (`bun test`) - fastest option, Jest-compatible APIs
- **DOM Testing**: Testing Library (Vanilla JS Testing Library) + jsdom (via Bun)
- **E2E Testing**: Playwright (browser automation, no server required) - still run via Node.js for stability
- **Mocking**: Bun's built-in mocking or sinon.js for complex scenarios
- **Package Management**: Bun for dependencies (8-13x faster than npm)

**Rationale for Bun + Playwright Hybrid:**
- Bun provides exceptional speed for unit tests (5-20x faster than Vitest)
- Bun's built-in test runner has Jest-compatible APIs, easy migration
- Playwright's browser testing is more stable than Bun's experimental browser support
- This gives the best of both worlds: fast unit tests + reliable E2E testing

### Testing Strategy by Component

#### JavaScript Modules (Unit Tests)
- **router.js**: Test URL parsing, route matching, branch fallback logic
- **fetcher.js**: Test GitHub API calls, error handling, retry logic (mocked)
- **renderer.js**: Test Mustache rendering, template processing
- **search.js**: Test search filtering, debouncing, keyboard navigation
- **repo-submission.js**: Test form validation, API calls, error handling
- **oauth-handler.js**: Test OAuth flow, token management, PKCE (mocked)
- **utils.js**: Test utility functions, data transformations

#### DOM/UI Testing
- **Form interactions**: Test form submission, validation, user feedback
- **Navigation**: Test routing, URL updates, browser history
- **Dynamic content**: Test search results, repository listings, report rendering
- **OAuth flow**: Test login button, OAuth redirect handling, user info display

#### Integration Testing
- **Search functionality**: End-to-end search flow from input to navigation
- **Repository submission**: Complete flow from form to GitHub Actions trigger
- **Report rendering**: Full flow from URL to report display
- **OAuth authentication**: Complete OAuth flow integration

#### E2E Testing (Playwright)
- **User journeys**: Critical user paths through the application
- **Cross-browser testing**: Chrome, Firefox, Safari compatibility
- **Mobile responsiveness**: Test on different viewport sizes
- **Error scenarios**: Network failures, missing repositories, OAuth errors

### Test Structure
```
tests/
├── unit/
│   ├── router.test.js
│   ├── fetcher.test.js
│   ├── renderer.test.js
│   ├── search.test.js
│   ├── repo-submission.test.js
│   ├── oauth-handler.test.js
│   └── utils.test.js
├── integration/
│   ├── search-flow.test.js
│   ├── submission-flow.test.js
│   ├── report-rendering.test.js
│   └── oauth-flow.test.js
├── e2e/
│   ├── user-journeys.spec.js
│   ├── cross-browser.spec.js
│   └── mobile-responsiveness.spec.js
└── fixtures/
    ├── sample-repositories.txt
    ├── sample-refactor-first.json
    └── sample-mustache-template.mustache
```

### TDD Workflow for Each Component

#### 1. Write Failing Test (Red) - CRITICAL STEP
**MANDATORY**: Write a failing unit test BEFORE writing any production code
- The test MUST fail initially (proving it tests actual behavior)
- Do not write production code until the test is written and failing
- This ensures the test drives the implementation and validates behavior
```javascript
// Example: router.test.js
import { describe, it, expect } from 'bun:test';
import { parseRoute, getDefaultBranch } from '../js/router.js';

describe('URL Routing', () => {
  it('should parse username and repository from URL', () => {
    const result = parseRoute('/refactorfirst/refactorfirst/main');
    expect(result.username).toBe('refactorfirst');
    expect(result.repository).toBe('refactorfirst');
    expect(result.branch).toBe('main');
  });

  it('should default to main branch when not specified', () => {
    const result = parseRoute('/refactorfirst/refactorfirst');
    expect(result.branch).toBe('main');
  });
});
```

#### 2. Run Test (Red)
```bash
bun test
# Test fails because router.js doesn't exist yet
```

#### 3. Write Implementation (Green)
```javascript
// router.js
export function parseRoute(path) {
  const parts = path.split('/').filter(Boolean);
  return {
    username: parts[0] || null,
    repository: parts[1] || null,
    branch: parts[2] || 'main'
  };
}
```

#### 4. Run Test (Green)
```bash
bun test
# Test passes
```

#### 5. Refactor - CONTINUOUS IMPROVEMENT
**MANDATORY**: Refactor code whenever possible to improve quality
- Improve code quality while keeping tests green
- Extract common patterns, improve naming, optimize performance
- Eliminate code duplication and improve maintainability
- Apply design patterns and best practices
- Refactor should happen frequently, not just at the end of features
- Always ensure tests remain green during refactoring

### Testing Configuration

#### Bun Test Configuration
Bun's test runner requires minimal configuration. For jsdom support:

```javascript
// bun.config.js (optional, for advanced configuration)
export default {
  test: {
    environment: 'jsdom', // for DOM testing
    coverage: {
      // Built-in coverage support
      reporter: ['text', 'html'],
      include: ['js/**/*.js'],
      exclude: ['tests/']
    }
  }
};
```

#### Playwright Configuration (for E2E tests)
Note: Playwright runs via Node.js for stable browser automation

```javascript
// playwright.config.js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:8000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
    {
      name: 'firefox',
      use: { browserName: 'firefox' },
    },
    {
      name: 'webkit',
      use: { browserName: 'webkit' },
    },
  ],
  webServer: {
    command: 'python -m http.server 8000',
    port: 8000,
    timeout: 120 * 1000,
  },
});
```

### Testing Best Practices

#### Critical TDD Rules
- **FAILING TESTS FIRST**: NEVER write production code before a failing test exists
- **TEST MUST FAIL**: Verify the test fails before writing implementation code
- **MINIMAL IMPLEMENTATION**: Write only enough code to make the test pass
- **NO PRODUCTION CODE WITHOUT TESTS**: All production code must be covered by tests
- **TEST DRIVES DESIGN**: Let tests guide the API design and code structure

#### Continuous Refactoring Practices
- **Refactor frequently**: Don't wait for "refactoring sprints" - refactor continuously
- **Refactor when green**: Only refactor when all tests are passing
- **Small, safe changes**: Make incremental refactoring changes
- **Test-driven refactoring**: Use tests to ensure refactoring doesn't break behavior
- **Eliminate duplication**: Follow DRY principle rigorously
- **Improve naming**: Use clear, descriptive names for variables, functions, and classes
- **Extract methods**: Break down large functions into smaller, focused ones
- **Apply patterns**: Use appropriate design patterns when they improve code
- **Optimize performance**: Refactor for better performance when tests reveal bottlenecks
- **Maintain readability**: Prioritize code clarity over cleverness

#### Unit Tests
- **Isolation**: Each test should be independent
- **Fast execution**: Unit tests should run in milliseconds
- **Mock external dependencies**: GitHub API, OAuth endpoints
- **Test edge cases**: Error conditions, boundary values
- **Arrange-Act-Assert**: Clear test structure

#### Integration Tests
- **Realistic scenarios**: Test actual component interactions
- **Minimal mocking**: Only mock external services
- **State management**: Test state changes and side effects
- **User workflows**: Test complete user processes

#### E2E Tests
- **Critical paths**: Focus on important user journeys
- **Real browsers**: Test in actual browser environments
- **Network conditions**: Test slow networks, failures
- **Mobile devices**: Test responsive design

### Mocking Strategy

#### GitHub API Mocking
```javascript
// fetcher.test.js
import { describe, it, expect, spyOn } from 'bun:test';
import { fetchRepositoryData } from '../js/fetcher.js';

describe('GitHub API Fetching', () => {
  it('should fetch repository data successfully', async () => {
    const mockData = { /* sample refactor-first.json */ };
    const mockFetch = spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData)
    });

    const result = await fetchRepositoryData('user', 'repo', 'main');
    expect(result).toEqual(mockData);
    mockFetch.mockRestore();
  });

  it('should handle 404 errors', async () => {
    const mockFetch = spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 404
    });

    await expect(
      fetchRepositoryData('user', 'repo', 'main')
    ).rejects.toThrow('Repository not found');
    mockFetch.mockRestore();
  });
});
```

#### OAuth Mocking
```javascript
// oauth-handler.js test example
describe('OAuth Handler', () => {
  it('should generate PKCE code verifier and challenge', () => {
    const { codeVerifier, codeChallenge } = generatePKCE();
    expect(codeVerifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    expect(codeChallenge).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
  });
});
```

### Continuous Testing

#### Pre-commit Hooks
```json
{
  "scripts": {
    "test": "bun test",
    "test:watch": "bun test --watch",
    "test:coverage": "bun test --coverage",
    "test:e2e": "npx playwright test",
    "lint": "eslint js/**/*.js",
    "pre-commit": "bun test && bun run lint"
  }
}
```

#### CI/CD Integration
```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest
      - run: bun install
      - run: bun test
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npx playwright install
      - run: npx playwright test
```

### Coverage Goals
- **Unit tests**: 80%+ coverage for core logic
- **Integration tests**: Critical user flows covered
- **E2E tests**: Main user journeys covered
- **Security tests**: OAuth and submission flows tested

### Testing During Implementation Phases

#### Phase 1: Core Infrastructure
- Test HTML structure and navigation
- Test URL routing logic
- Test basic page loading

#### Phase 2: Landing & Search
- Test search functionality (unit + integration)
- Test repository submission flow (end-to-end)
- Test OAuth authentication (mocked integration)

#### Phase 3: Report Rendering
- Test GitHub API fetching (mocked)
- Test Mustache rendering
- Test branch fallback logic
- Test error handling and loading states

#### Phase 4: Additional Pages
- Test page navigation and routing
- Test form submissions and validation
- Test content rendering for all pages

#### Phase 5: Polish & Optimization
- Test responsive design (E2E)
- Test performance (load times)
- Test accessibility (ARIA, keyboard nav)
- Test cross-browser compatibility

## Development Workflow Requirements

### Mandatory TDD Process
1. **Write Failing Test First**: Before writing any production code, write a test that fails
2. **Verify Test Fails**: Run the test to confirm it fails (proves it tests actual behavior)
3. **Write Minimal Implementation**: Write only enough production code to make the test pass
4. **Run Test (Green)**: Verify the test now passes
5. **Refactor**: Improve the code while keeping tests green
6. **Repeat**: Continue this cycle for all features

### Code Quality Standards
- **Continuous Refactoring**: Refactor code whenever possible to improve quality
- **No Code Duplication**: Eliminate duplicate code through extraction and abstraction
- **Clear Naming**: Use descriptive names for variables, functions, and modules
- **Small Functions**: Keep functions focused and small (single responsibility)
- **Test Coverage**: Maintain high test coverage for all production code
- **Clean Code**: Prioritize readability and maintainability

### Anti-Patterns to Avoid
- ❌ Writing production code before tests
- ❌ Skipping tests for "simple" features
- ❌ Writing tests that always pass (fake tests)
- ❌ Refactoring without test coverage
- ❌ Accumulating technical debt without refactoring
- ❌ Writing large, monolithic functions

## Overview
Create a static client-side rendered web application deployable to GitHub Pages (and compatible with GitLab/BitBucket) that renders RefactorFirst reports by fetching JSON data from repository `.refactorfirst` directories.

## Architecture Requirements
- **Purely client-side**: No Node.js, Bun, NPM, or server-side rendering for the application
- **JavaScript modules permitted**: ES6 modules for code organization
- **Local testing**: Easy to test without deployment
- **Multi-platform**: Works on GitHub Pages, GitLab Pages, BitBucket Pages
- **Testing infrastructure**: Bun for unit testing (fastest), Node.js only for Playwright E2E testing during development
- **TDD mandate**: All production code must be written after failing unit tests
- **Continuous refactoring**: Code must be refactored continuously to maintain quality
- **Code quality**: Prioritize maintainability, readability, and testability

## Core Features

### 1. URL Routing System
- **Pattern**: `https://refactorfirst.github.io/<username>/<repository>/<branch>`
- **Examples**:
  - `https://refactorfirst.github.io/refactorfirst/refactorfirst/main` → Full report
  - `https://refactorfirst.github.io/refactorfirst/refactorfirst` → Defaults to `main` branch
  - `https://refactorfirst.github.io/refactorfirst` → User's / Org's repository list
  - `https://refactorfirst.github.io/` → Landing page with search

- **Branch Fallback Logic**:
  1. Try specified branch from URL
  2. If not specified, try `main` branch
  3. If `main` fails (404 or no content), try `master` branch
  4. If all fail, show error with link to repository

- **Data Fetching**:
  - Construct GitHub raw URL: `https://raw.githubusercontent.com/<username>/<repository>/<branch>/.refactorfirst/refactor-first.json`
  - Fetch JSON data via client-side JavaScript
  - Handle CORS issues (GitHub raw content supports CORS)
  - Fetch Mustache template from same repository: `https://raw.githubusercontent.com/<username>/<repository>/<branch>/.refactorfirst/refactor-first-report.mustache`

### 2. Landing Page
- **Hero Section**: Clean, modern landing with RefactorFirst branding
- **Type-Ahead Search Bar**:
  - Backed by static text file (`../repositories.txt`)
  - Format: One entry per line: `username/repository`
  - Real-time filtering as user types
  - Keyboard navigation support
  - Click/enter to navigate to repository report

- **Featured Repositories**: Show a few example repositories with RefactorFirst reports
- **"Add My Repo" Button**: Prominent call-to-action button that links to repository submission form

### 2.5. Repository Submission Page
- **URL Pattern**: `https://refactorfirst.github.io/add-repo`
- **Authentication**: GitHub OAuth login required before submission
- **Form Fields**:
  - User/Organization Name (text input)
  - Repository Name (text input)
  - Submit button
- **Information Text**: "Only repositories with a `.refactorfirst/refactor-first.json` file will be added. The RefactorFirst GitHub Page redeploys every 10 minutes."
- **User Information Display**: Shows logged-in GitHub user (username, avatar)
- **Validation**:
  - Required fields validation
  - Basic format validation (no special characters)
  - Real-time feedback during submission
  - Verify user has access to the repository they're submitting
- **Submission Process**:
  1. User must authenticate via GitHub OAuth
  2. User submits form with user/org and repository name
  3. System verifies user has access to the repository
  4. Client-side JavaScript triggers GitHub Actions workflow via GitHub API
  5. Show loading state during validation
  6. Display success/error message based on workflow result
- **Error Handling**:
  - Authentication required
  - Repository not found
  - User lacks access to repository
  - Missing `.refactorfirst/refactor-first.json` file
  - Repository already in listing
  - Network/API errors
  - Rate limiting from GitHub API
  - Abuse detection (multiple submissions from same user)

### 3. User Repository Listing Page
- **URL Pattern**: `https://refactorfirst.github.io/<username>`
- **Display**: All repositories for the specified user from `../repositories.txt`
- **Layout**: Two-column grid, centered on page
- **Sorting**: Alphabetical order by repository name
- **Pagination**: 
  - 50 repositories per page
  - Pagination controls at bottom
  - URL updates with page parameter: `?page=2`

### 4. Top Navigation Menu
- **Height Constraint**: Maximum 140 pixels tall
- **Responsive Design**: Mobile-friendly hamburger menu for smaller screens

**Menu Items**:
1. **Home** - Returns to landing page
2. **Search** - Type-ahead search bar (always visible in menu)
3. **Add Your Repo** - Link to repository submission form
4. **Getting Started** - Guide for adding repositories
5. **Documentation** - Link to RefactorFirst documentation
6. **FAQ** - Common questions about RefactorFirst reports
7. **Examples** - Gallery of example reports from well-known projects
8. **API** - Simple documentation on how to integrate with other tools
9. **About** - Information about RefactorFirst
10. **Feedback** - Link to GitHub Issues or feedback form
11. **GitHub** - Link to RefactorFirst GitHub repository

### 5. Report Rendering
- **Template Engine**: Use Mustache.js (already in existing viewer)
- **Rendering Process**:
  1. Fetch JSON data from repository
  2. Fetch Mustache template from repository (or use bundled fallback)
  3. Render HTML using Mustache.js
  4. Inject into page below top menu
  5. Initialize charts and graphs (Chart.js, Sigma.js, etc.)

- **Fallback Template**: Bundle a default Mustache template in case repository doesn't have one
- **Error Handling**:
  - Show friendly error if JSON not found
  - Show error if JSON is malformed
  - Show loading state during fetch
  - Retry mechanism for network failures

### 6. Static Data File
- **File**: `../repositories.txt`
- **Location**: Root of web application
- **Format**: Plain text, one `username/repository` per line
- **Example**:
  ```
  refactorfirst/refactorfirst
  spring-projects/spring-framework
  apache/tomcat
  ```
- **Maintenance**: Can be updated via PR to the web application repo

### 7. Additional Pages Content

#### Getting Started Page
- **Purpose**: Guide for new users to add their repositories
- **Content**:
  - How to set up RefactorFirst in your repository
  - Maven plugin configuration
  - GitHub Actions workflow setup
  - Adding repository to the RefactorFirst GitHub Pages
  - GitHub OAuth authentication process
  - Why GitHub authentication is required
  - What permissions are needed and why
  - Troubleshooting common issues
  - Copy-paste workflow YAML template
  - OAuth authorization and permissions explanation

#### Documentation Page
- **Purpose**: Comprehensive guide to using RefactorFirst
- **Content**:
  - How to generate reports (Maven plugin, CLI)
  - Understanding report sections
  - Interpreting metrics and recommendations
  - Integration with CI/CD pipelines
  - Link to external RefactorFirst documentation

#### FAQ Page
- **Purpose**: Address common questions about RefactorFirst reports
- **Content**:
  - What do the different priority colors mean?
  - How often should I run RefactorFirst?
  - What if my repository doesn't have a report?
  - How do I add my repository to the listing?
  - How long does it take for my repository to appear after submission?
  - Why do I need to authenticate with GitHub?
  - What permissions does the OAuth app require?
  - Is my GitHub data safe?
  - Understanding disharmonies (God Class, Brain Class, etc.)
  - Branch comparison limitations

#### Examples Page
- **Purpose**: Showcase RefactorFirst reports from well-known projects
- **Content**:
  - Gallery of example reports with screenshots
  - Case studies from popular open-source projects
  - Before/after refactoring examples
  - Different types of codebases analyzed (small, medium, large)
  - Links to live reports for featured repositories

#### API Page
- **Purpose**: Documentation for integrating RefactorFirst with other tools
- **Content**:
  - How to fetch reports programmatically
  - JSON schema documentation
  - URL patterns for direct report access
  - Webhook integration examples
  - Third-party tool integration examples
  - Rate limiting and caching recommendations

## Technical Implementation

### File Structure
```
refactorfirst-page/
├── index.html                    # Main entry point
├── repositories.txt              # Static repository listing
├── package.json                  # Dependencies for testing
├── bun.config.js                 # Bun configuration (optional)
├── playwright.config.js          # Playwright E2E test configuration
├── .github/
│   └── workflows/
│       ├── add-repository.yml   # Repository validation workflow
│       └── redeploy.yml          # Scheduled redeployment workflow
├── css/
│   ├── main.css                  # Main stylesheet
│   └── components.css            # Component-specific styles
├── js/
│   ├── main.js                   # Main application entry point
│   ├── router.js                 # URL routing logic
│   ├── fetcher.js                # GitHub API/raw content fetching
│   ├── renderer.js               # Mustache rendering logic
│   ├── search.js                 # Type-ahead search functionality
│   ├── repo-submission.js        # Repository submission form handler
│   ├── oauth-handler.js          # GitHub OAuth authentication handler
│   ├── error-handler.js          # Error handling and display logic
│   ├── rate-limiter.js           # GitHub API rate limiting handler
│   ├── cache-manager.js          # Client-side caching management
│   └── utils.js                  # Utility functions
├── templates/
│   ├── landing.html              # Landing page template
│   ├── add-repo.html             # Repository submission form template
│   ├── getting-started.html     # Getting started guide template
│   ├── user-repos.html           # User repository listing template
│   ├── report.html               # Report display template
│   ├── about.html                # About page template
│   ├── feedback.html             # Feedback page template
│   ├── documentation.html       # Documentation page template
│   ├── faq.html                  # FAQ page template
│   ├── examples.html             # Examples gallery template
│   ├── api.html                  # API documentation template
│   ├── error-404.html            # 404 error page template
│   ├── error-rate-limit.html     # Rate limiting error page template
│   ├── error-oauth.html           # OAuth error page template
│   ├── error-api.html            # API error page template
│   ├── error-template.html       # Template error page template
│   ├── error-general.html        # General error page template
│   ├── privacy-policy.html       # Privacy policy page template
│   └── terms-of-service.html      # Terms of service page template
├── tests/
│   ├── unit/
│   │   ├── router.test.js
│   │   ├── fetcher.test.js
│   │   ├── renderer.test.js
│   │   ├── search.test.js
│   │   ├── repo-submission.test.js
│   │   ├── oauth-handler.test.js
│   │   ├── error-handler.test.js
│   │   ├── rate-limiter.test.js
│   │   ├── cache-manager.test.js
│   │   └── utils.test.js
│   ├── integration/
│   │   ├── search-flow.test.js
│   │   ├── submission-flow.test.js
│   │   ├── report-rendering.test.js
│   │   └── oauth-flow.test.js
│   ├── e2e/
│   │   ├── user-journeys.spec.js
│   │   ├── cross-browser.spec.js
│   │   └── mobile-responsiveness.spec.js
│   └── fixtures/
│       ├── sample-repositories.txt
│       ├── sample-refactor-first.json
│       └── sample-mustache-template.mustache
└── assets/
    ├── refactor-first-report.mustache  # Fallback Mustache template
    ├── logo.png                  # RefactorFirst logo
    └── sentry-config.js         # Sentry error tracking configuration
```

### package.json (Testing Dependencies)
```json
{
  "name": "refactorfirst-page",
  "version": "1.0.0",
  "description": "RefactorFirst GitHub Pages Application",
  "type": "module",
  "scripts": {
    "test": "bun test",
    "test:watch": "bun test --watch",
    "test:coverage": "bun test --coverage",
    "test:e2e": "npx playwright test",
    "test:e2e:ui": "npx playwright test --ui",
    "lint": "eslint js/**/*.js tests/**/*.js",
    "lint:fix": "eslint js/**/*.js tests/**/*.js --fix"
  },
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "@sentry/browser": "^7.80.0",
    "eslint": "^8.55.0",
    "jsdom": "^23.0.0"
  },
  "dependencies": {
    "mustache": "^4.2.0"
  },
  "engines": {
    "bun": ">=1.0.0"
  }
}
```

**Note**: No unit test framework dependencies needed - Bun's built-in test runner is used. Playwright still requires Node.js for stable browser automation. Sentry added for error tracking.

### JavaScript Module Architecture

#### router.js
```javascript
// Parse URL parameters and route to appropriate page
// Handle branch fallback logic (main -> master)
// Update browser history for navigation
```

#### fetcher.js
```javascript
// Fetch JSON from GitHub raw URLs
// Fetch Mustache templates
// Handle CORS and errors
// Implement retry logic
```

#### renderer.js
```javascript
// Initialize Mustache.js
// Render templates with data
// Initialize Chart.js for bubble charts
// Initialize Sigma.js/3D-force-graph for visualizations
```

#### search.js
```javascript
// Load and parse repositories.txt
// Implement type-ahead filtering
// Handle keyboard navigation
// Debounce input for performance
```

#### repo-submission.js
```javascript
// Handle repository submission form
// Validate user input
// GitHub OAuth authentication flow
// Trigger GitHub Actions workflow via GitHub API
// Handle workflow responses and errors
// Update UI with success/error messages

// Implementation details:
// - GitHub OAuth 2.0 authorization code flow
// - Handle OAuth callback and token exchange
// - Store OAuth token in sessionStorage for session duration
// - Fetch and display user's GitHub profile information
// - Verify user has access to submitted repository
// - Use GitHub REST API to trigger repository_dispatch event
// - Include submitting username in workflow payload
// - Poll workflow run status for completion
// - Handle rate limiting and API errors gracefully
// - Implement logout functionality
```

#### oauth-handler.js
```javascript
// GitHub OAuth authentication flow
// Handle OAuth redirect and callback
// Exchange authorization code for access token
// Store and manage OAuth tokens
// Fetch user profile information
// Handle token refresh and expiration
// Implement logout functionality

// Implementation details:
// - Generate and store OAuth state parameter for CSRF protection
// - Implement PKCE (Proof Key for Code Exchange) for enhanced security
// - Handle OAuth callback URL parsing and code extraction
// - Exchange authorization code for access token via GitHub API
// - Store access token in sessionStorage
// - Fetch user profile (username, avatar) using access token
// - Implement token refresh if using refresh tokens
// - Handle token expiration and re-authentication
// - Clear tokens on logout
// - Handle OAuth errors and user cancellation
```

#### error-handler.js
```javascript
// Centralized error handling logic
// Route errors to appropriate error pages
// Display user-friendly error messages
// Log errors to monitoring system
// Implement retry logic for recoverable errors

// Implementation details:
// - Error classification (network, API, authentication, etc.)
// - Error page routing based on error type
// - User-friendly error message generation
// - Error logging to Sentry
// - Retry logic with exponential backoff
// - Error recovery suggestions
```

#### rate-limiter.js
```javascript
// GitHub API rate limiting management
// Track rate limit headers from API responses
// Implement client-side rate limiting
// Handle rate limit exceeded scenarios
// Cache rate limit status

// Implementation details:
// - Parse X-RateLimit-Remaining and X-RateLimit-Reset headers
// - Implement client-side rate limiting (max requests per time window)
// - Queue requests when rate limits are approached
// - Graceful degradation when rate limits are hit
// - Rate limit status caching
// - User notification for rate limiting
```

#### cache-manager.js
```javascript
// Client-side caching for API responses
// Cache GitHub API responses to reduce calls
// Implement cache invalidation strategies
// Manage cache size and expiration

// Implementation details:
// - Cache API responses in localStorage/memory
// - Implement cache keys based on request parameters
// - Cache expiration times based on data type
// - Cache invalidation on mutations
// - Cache size management (LRU eviction)
// - Offline cache for critical data
```

### GitHub Actions Workflows

#### Workflow 1: Repository Validation and Addition
**File**: `../.github/workflows/add-repository.yml`
**Purpose**: Validate and add repositories to `../repositories.txt`

```yaml
name: Add Repository
on:
  repository_dispatch:
    types: [add-repository]

permissions:
  contents: write

jobs:
  add-repository:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Validate repository and user access
        id: validate
        run: |
          OWNER="${{ github.event.client_payload.owner }}"
          REPO="${{ github.event.client_payload.repo }}"
          SUBMITTED_BY="${{ github.event.client_payload.submitted_by }}"
          REPO_FULL_NAME="$OWNER/$REPO"

          echo "Validating repository: $REPO_FULL_NAME"
          echo "Submitted by: $SUBMITTED_BY"

          # Check if repository exists
          if ! gh repo view "$REPO_FULL_NAME" --json name --jq '.name' > /dev/null 2>&1; then
            echo "error=Repository not found" >> $GITHUB_OUTPUT
            exit 1
          fi

          # Check if user has access to the repository
          # First try collaborators endpoint (for organization repos)
          if ! gh api "repos/$REPO_FULL_NAME/collaborators/$SUBMITTED_BY" --jq '.permission' > /dev/null 2>&1; then
            # If collaborators endpoint fails, check if user is the owner
            OWNER_INFO=$(gh repo view "$REPO_FULL_NAME" --json owner --jq '.owner.login')
            if [[ "$OWNER_INFO" != "$SUBMITTED_BY" ]]; then
              echo "error=User does not have access to this repository" >> $GITHUB_OUTPUT
              exit 1
            fi
            PERMISSION="admin"
          else
            # Check user has write or admin permission
            PERMISSION=$(gh api "repos/$REPO_FULL_NAME/collaborators/$SUBMITTED_BY" --jq '.permission')
            if [[ "$PERMISSION" != "write" && "$PERMISSION" != "admin" ]]; then
              echo "error=User does not have write access to this repository" >> $GITHUB_OUTPUT
              exit 1
            fi
          fi

          # Check for .refactorfirst/refactor-first.json file
          if ! gh api "repos/$REPO_FULL_NAME/contents/.refactorfirst/refactor-first.json" --jq '.sha' > /dev/null 2>&1; then
            echo "error=RefactorFirst JSON file not found" >> $GITHUB_OUTPUT
            exit 1
          fi

          echo "status=valid" >> $GITHUB_OUTPUT
          echo "repository=$REPO_FULL_NAME" >> $GITHUB_OUTPUT
          echo "submitted_by=$SUBMITTED_BY" >> $GITHUB_OUTPUT
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Add to repositories.txt
        if: steps.validate.outputs.status == 'valid'
        run: |
          REPO="${{ steps.validate.outputs.repository }}"
          SUBMITTED_BY="${{ steps.validate.outputs.submitted_by }}"

          # Check if repository already exists
          if grep -q "^$REPO$" repositories.txt; then
            echo "Repository already in listing"
            exit 0
          fi

          # Add repository and sort alphabetically
          echo "$REPO" >> repositories.txt
          sort -o repositories.txt repositories.txt

          # Remove duplicates
          awk '!seen[$0]++' repositories.txt > temp.txt && mv temp.txt repositories.txt

          echo "Repository $REPO added by $SUBMITTED_BY"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Commit changes
        if: steps.validate.outputs.status == 'valid'
        run: |
          REPO="${{ steps.validate.outputs.repository }}"
          SUBMITTED_BY="${{ steps.validate.outputs.submitted_by }}"

          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add repositories.txt
          git diff --staged --quiet || git commit -m "Add repository: $REPO (submitted by $SUBMITTED_BY)"
          git push
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Report failure
        if: failure()
        run: |
          echo "Repository validation failed: ${{ steps.validate.outputs.error }}"
```

#### Workflow 2: Scheduled Redeployment
**File**: `../.github/workflows/redeploy.yml`
**Purpose**: Redeploy GitHub Pages every 10 minutes if repositories.txt has changed

```yaml
name: Scheduled Redeploy
on:
  schedule:
    - cron: '*/10 * * * *'  # Every 10 minutes
  workflow_dispatch:        # Allow manual triggering

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  check-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Check for repositories.txt changes
        id: check-changes
        run: |
          # Get the last commit date for repositories.txt
          LAST_COMMIT=$(git log -1 --format=%ct -- repositories.txt)
          CURRENT_TIME=$(date +%s)
          TIME_DIFF=$((CURRENT_TIME - LAST_COMMIT))

          echo "Last commit: $LAST_COMMIT"
          echo "Current time: $CURRENT_TIME"
          echo "Time difference: $TIME_DIFF seconds"

          # Only deploy if changed in the last 15 minutes
          if [ $TIME_DIFF -lt 900 ]; then
            echo "changed=true" >> $GITHUB_OUTPUT
            echo "repositories.txt has recent changes, deploying"
          else
            echo "changed=false" >> $GITHUB_OUTPUT
            echo "No recent changes, skipping deployment"
          fi

      - name: Setup Pages
        if: steps.check-changes.outputs.changed == 'true'
        uses: actions/configure-pages@v4

      - name: Upload artifact
        if: steps.check-changes.outputs.changed == 'true'
        uses: actions/upload-pages-artifact@v3
        with:
          path: '.'

      - name: Deploy to GitHub Pages
        if: steps.check-changes.outputs.changed == 'true'
        id: deployment
        uses: actions/deploy-pages@v4
```

#### Workflow 3: User Repository RefactorFirst Report Generation
**File**: (Provided to users to add to their repositories)
**Purpose**: Run RefactorFirst Maven goal on merge to default branch

```yaml
name: Generate RefactorFirst Report
on:
  push:
    branches:
      - main
      - master
  workflow_dispatch:  # Allow manual triggering

jobs:
  generate-report:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up JDK
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
          cache: 'maven'

      - name: Generate RefactorFirst report
        run: mvn refactorfirst:jsonReport

      - name: Commit report
        run: |
          if [ -f .refactorfirst/refactor-first.json ]; then
            git config user.name "github-actions[bot]"
            git config user.email "github-actions[bot]@users.noreply.github.com"
            git add .refactorfirst/refactor-first.json
            git diff --staged --quiet || git commit -m "Update RefactorFirst report"
            git push
          fi
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### CSS Architecture
- Use CSS custom properties (variables) for theming
- Mobile-first responsive design
- Flexbox and Grid for layouts
- MVP.css as base (already used in existing viewer)
- Custom styles for:
  - Top navigation menu (max 140px)
  - Search bar styling
  - Repository grid layout
  - Pagination controls
  - Loading states
  - Error messages

### Local Testing
- **Method 1**: Simple HTTP server
  ```bash
  # Python 3
  python -m http.server 8000
  
  # Python 2
  python -m SimpleHTTPServer 8000
  
  # Node.js (if available)
  npx http-server -p 8000
  ```

- **Method 2**: VS Code Live Server extension
- **Method 3**: Direct file opening (with CORS limitations for GitHub fetching)

- **Testing Workflow**:
  ```bash
  # Install test dependencies
  bun install
  
  # Run unit tests
  bun test
  
  # Run tests in watch mode during development
  bun test --watch
  
  # Run tests with coverage
  bun test --coverage
  
  # Run E2E tests (requires local server running)
  npx playwright test
  
  # Run E2E tests with UI
  npx playwright test --ui
  
  # Lint code
  bun run lint
  
  # Fix linting issues
  bun run lint:fix
  ```

### Deployment Strategy

#### GitHub Pages
- Repository: `refactorfirst/refactorfirst.github.io`
- Branch: `gh-pages` or main/docs folder
- Custom domain: `refactorfirst.github.io` (or subdomain)
- Workflow: Push to trigger automatic deployment
- **GitHub OAuth App Configuration**:
  - Register OAuth App in GitHub organization settings
  - Application name: "RefactorFirst GitHub Pages"
  - Homepage URL: `https://refactorfirst.github.io`
  - Authorization callback URL: `https://refactorfirst.github.io/add-repo/callback`
  - Store Client ID and Client Secret as repository secrets
  - Required scopes: `public_repo`, `read:user`

#### GitLab Pages
- Similar structure, deploy from `../.gitlab-ci.yml`
- URL: `https://refactorfirst.gitlab.io`

#### BitBucket Pages
- Deploy from `../bitbucket-pipelines.yml`
- URL: `https://refactorfirst.bitbucket.io`

## Repository Submission Workflow

### User Experience Flow
1. **Discovery**: User sees "Add My Repo" button on landing page
2. **Navigation**: User navigates to submission form
3. **Authentication**: User must authenticate via GitHub OAuth
   - "Login with GitHub" button redirects to GitHub OAuth
   - User authorizes the application
   - User is redirected back with OAuth code
   - System exchanges code for access token
   - User's GitHub information (username, avatar) is displayed
4. **Submission**: User enters:
   - GitHub username or organization name
   - Repository name
5. **Authorization Check**: System verifies user has access to the repository
   - Uses GitHub API to check repository permissions
   - Only allows submission if user has write/admin access
6. **Validation**: System validates repository:
   - Checks if repository exists
   - Verifies `.refactorfirst/refactor-first.json` file exists
   - Checks if repository is already in listing
7. **Processing**: GitHub Actions workflow triggered via repository_dispatch
8. **Feedback**: User sees real-time status updates:
   - "Validating repository..."
   - "Repository validated successfully"
   - "Adding to listing..."
   - "Repository added successfully"
   - Or appropriate error messages
9. **Deployment**: Scheduled workflow deploys changes within 10 minutes
10. **Verification**: User can search for their repository after deployment

### GitHub OAuth Integration
- **OAuth Flow**: GitHub OAuth 2.0 authorization code flow
- **Scopes Required**: `public_repo` (for repository access) and `read:user` (for user info)
- **GitHub OAuth App**: Must be registered as a GitHub OAuth App
  - Client ID and Client Secret stored as GitHub Secrets
  - Callback URL: `https://refactorfirst.github.io/add-repo/callback`
- **Token Storage**: Access token stored in sessionStorage for session duration
- **Token Refresh**: Implement token refresh if using refresh tokens
- **User Info**: Fetch and display user's GitHub profile (username, avatar)

### GitHub API Integration Details
- **Endpoint**: `POST /repos/{owner}/{repo}/dispatches`
- **Payload**: `{"event_type": "add-repository", "client_payload": {"owner": "...", "repo": "...", "submitted_by": "username"}}`
- **Authentication**: OAuth access token in Authorization header
- **Repository Access Check**: `GET /repos/{owner}/{repo}/collaborators/{username}` or `GET /user/repos`
- **Rate Limiting**: Respect GitHub API rate limits (5000/hour for authenticated requests)
- **Error Handling**: Graceful handling of 403, 404, 422, and 429 responses
- **Security**: Token never stored permanently, cleared on session end
- **Audit Trail**: Include submitting username in workflow payload for audit purposes

### User-Provided Workflow Setup
- **Documentation**: Clear instructions for users to add the RefactorFirst workflow to their repos
- **Copy-Paste Ready**: YAML code snippet provided in documentation
- **Prerequisites**: 
  - Repository must use Maven
  - RefactorFirst Maven plugin must be configured
  - `.refactorfirst` directory must exist
  - GitHub write permissions for the repository
- **Customization**: Users can adjust Java version, branches, etc.
- **No Additional Authentication**: The user-provided workflow doesn't require OAuth - it runs in the user's own repository context

## Implementation Phases

### Phase 1: Core Infrastructure
1. Set up testing infrastructure (Bun, Playwright, package.json)
2. Write tests for basic HTML structure
3. Implement basic HTML structure with top menu
4. Write tests for URL routing system
5. Implement URL routing system (TDD approach)
6. Create repository data file (`../repositories.txt`)
7. Set up local testing workflow
8. Register GitHub OAuth App and configure secrets
9. Implement GitHub API rate limiting strategy
10. Set up monitoring (Sentry, performance monitoring)
11. Create backup strategy for critical data
12. Implement Content Security Policy headers

### Phase 2: Landing & Search
1. Write tests for landing page components
2. Design and implement landing page (TDD approach)
3. Write tests for search functionality
4. Implement type-ahead search bar (TDD approach)
5. Write tests for repository listing
6. Create user repository listing page (TDD approach)
7. Write tests for pagination
8. Add pagination for repository lists (TDD approach)
9. Write tests for OAuth authentication
10. Implement GitHub OAuth authentication flow (TDD approach)
11. Write tests for repository submission
12. Implement "Add My Repo" button and submission form (TDD approach)
13. Set up GitHub Actions workflow for repository validation
14. Configure scheduled redeployment workflow
15. Design comprehensive error pages (404, rate limiting, OAuth, API errors)
16. Implement abuse prevention mechanisms
17. Conduct security audit for OAuth and workflows

### Phase 3: Report Rendering
1. Write tests for GitHub API fetching
2. Implement GitHub raw content fetching (TDD approach)
3. Write tests for Mustache rendering
4. Integrate Mustache.js rendering (TDD approach)
5. Write tests for branch fallback logic
6. Add branch fallback logic (TDD approach)
7. Write tests for error handling
8. Implement error handling and loading states (TDD approach)
9. Implement template compatibility validation
10. Add CDN fallback strategy

### Phase 4: Additional Pages
1. Write tests for About page
2. Create About page (TDD approach)
3. Write tests for Feedback page
4. Create Feedback page (TDD approach)
5. Write tests for Getting Started page
6. Create Getting Started page with OAuth instructions (TDD approach)
7. Write tests for Documentation page
8. Create Documentation page (TDD approach)
9. Write tests for FAQ page
10. Create FAQ page with OAuth-related questions (TDD approach)
11. Write tests for Examples gallery
12. Create Examples gallery page (TDD approach)
13. Write tests for API documentation
14. Create API documentation page (TDD approach)
15. Create legal documentation (privacy policy, terms of service)
16. Implement accessibility features (WCAG 2.1 AA)

### Phase 5: Polish & Optimization
1. Write tests for responsive design
2. Responsive design improvements (TDD approach)
3. Write performance tests
4. Performance optimization (lazy loading, caching)
5. Write accessibility tests
6. Accessibility improvements (ARIA labels, keyboard navigation)
7. Write tests for error pages
8. Error page enhancements (TDD approach)
9. Cross-browser testing with Playwright
10. Mobile responsiveness testing with Playwright
11. Define performance budgets and monitoring
12. Implement international character support
13. Analyze test coverage for error paths
14. Conduct accessibility audit
15. Set up user analytics

## CDN Dependencies
Based on existing viewer, include:
- Mustache.js (4.2.0)
- Chart.js (4.4.7)
- svg-pan-zoom (3.6.1)
- Sigma.js (2.4.0)
- graphology (0.25.4)
- graphlib-dot (0.6.4)
- 3d-force-graph
- @vizdom/vizdom-ts-web (0.1.19)
- MVP.css (base styling)

## Security Considerations
- No sensitive data in client-side code
- Validate URL parameters to prevent XSS
- Use HTTPS for all external requests
- Implement Content Security Policy headers
- Sanitize rendered HTML content
- **GitHub API Rate Limiting**:
  - Implement client-side caching for API responses
  - Respect rate limit headers (X-RateLimit-Remaining, X-RateLimit-Reset)
  - Implement exponential backoff for rate-limited requests
  - Graceful degradation when rate limits are reached
  - Cache rate limit status to avoid unnecessary API calls
- **Repository Submission Security**:
  - GitHub OAuth tokens stored only in sessionStorage
  - Tokens cleared on session end
  - Never log or transmit tokens except to GitHub API
  - OAuth token has minimal required scopes (`public_repo`, `read:user`)
  - Validate all user inputs before API calls
  - Rate limiting to prevent abuse (max 5 submissions per hour per user)
  - CSRF protection for form submissions
  - Input sanitization to prevent injection attacks
  - Verify user has write access to submitted repository
  - Audit trail: all submissions associated with GitHub username
  - Content moderation for inappropriate repositories
- **GitHub OAuth Security**:
  - OAuth Client Secret stored as GitHub Secret
  - Use PKCE (Proof Key for Code Exchange) for enhanced security
  - Validate OAuth state parameter to prevent CSRF
  - Implement token expiration and refresh (short-lived tokens)
  - Secure callback URL configuration
  - Regular security audits of OAuth implementation
  - Token rotation schedule for OAuth Client Secret
- **GitHub Actions Security**:
  - Use GitHub Secrets for sensitive data (OAuth Client Secret)
  - Minimal permissions required (contents: write)
  - Validate all client payload data
  - Rate limit repository additions per user
  - Audit logging for all repository additions with submitter info
  - Input sanitization in workflow
  - Regular security reviews of workflow permissions

## Error Handling & Monitoring

### Comprehensive Error Pages
- **404 Error Page**: Repository not found, page not found
- **Rate Limiting Error Page**: GitHub API rate limit exceeded
- **OAuth Error Page**: Authentication failures, authorization errors
- **GitHub API Error Page**: API failures, network errors
- **Template Error Page**: Mustache rendering failures
- **General Error Page**: Unexpected errors, system failures
- **Error Page Features**:
  - Clear, user-friendly error messages
  - Suggested actions and next steps
  - Navigation back to home/search
  - Error codes for support reference
  - Retry functionality where appropriate

### Monitoring & Alerting
- **Error Tracking**: Sentry integration for error monitoring
  - Capture JavaScript errors and unhandled exceptions
  - Track API failures and network errors
  - Monitor OAuth authentication failures
  - Alert on critical error spikes
- **Performance Monitoring**: Core Web Vitals tracking
  - Lighthouse CI integration
  - Real User Monitoring (RUM)
  - Performance budget alerts
- **GitHub API Monitoring**:
  - Track rate limit usage
  - Monitor API response times
  - Alert on API failures or deprecations
- **User Analytics**: Basic usage tracking
  - Page views and user sessions
  - Search usage statistics
  - Repository submission metrics
  - Feature adoption tracking

### Backup & Disaster Recovery
- **Critical Data Backup**:
  - `../repositories.txt`: Automated daily backups to separate branch
  - OAuth secrets: Regular rotation and secure storage
  - Configuration files: Version control with tags
- **Backup Strategy**:
  - Automated daily backups to separate repository
  - Weekly full backups to external storage
  - Monthly disaster recovery testing
  - Backup integrity verification
- **Recovery Procedures**:
  - Documented recovery procedures for each critical component
  - Recovery time objectives (RTO) and recovery point objectives (RPO)
  - Incident response plan
  - Communication plan for outages

## Performance Considerations
- Lazy load heavy visualization libraries
- Implement client-side caching for fetched JSON
- Optimize images and assets
- Use CDNs for all JavaScript libraries
- Minimize DOM manipulations
- **Performance Budgets**:
  - Initial page load: < 3 seconds
  - Time to Interactive: < 5 seconds
  - First Contentful Paint: < 1.5 seconds
  - Search response time: < 200ms
  - Report rendering time: < 2 seconds
- **Performance Monitoring**:
  - Implement Core Web Vitals tracking
  - Monitor Lighthouse scores
  - Track real user monitoring (RUM) metrics
  - Set up performance alerts for degradation
  - Regular performance audits (monthly)
- **CDN Fallback Strategy**:
  - Primary CDN: jsdelivr.net
  - Secondary CDN: cdnjs.cloudflare.com
  - Fallback: Local hosting of critical libraries
  - CDN health monitoring and automatic failover
  - Version pinning for stability

## Browser Compatibility
- Modern browsers (Chrome, Firefox, Safari, Edge)
- ES6 module support required
- Fallback for older browsers (optional)
- **Cross-Browser Testing**:
  - Test on latest versions of Chrome, Firefox, Safari, Edge
  - Test on mobile browsers (iOS Safari, Chrome Mobile)
  - Progressive enhancement for older browsers
  - Feature detection and graceful degradation

## Accessibility & Inclusion
- **WCAG 2.1 AA Compliance**:
  - Semantic HTML structure
  - ARIA labels for interactive elements
  - Keyboard navigation support
  - Screen reader compatibility
  - Color contrast compliance (4.5:1 for text)
  - Focus indicators for keyboard users
  - Alt text for images
  - Skip navigation links
- **Accessibility Testing**:
  - Automated testing with axe-core
  - Manual keyboard navigation testing
  - Screen reader testing (NVDA, JAWS, VoiceOver)
  - Regular accessibility audits (quarterly)
  - Accessibility audit reports and remediation
- **International Character Support**:
  - UTF-8 encoding throughout
  - Support for non-ASCII repository names
  - Proper handling of international characters in search
  - Language attributes for HTML elements

## Legal & Compliance
- **Privacy Policy**:
  - Data collection practices
  - OAuth token handling
  - GitHub API data usage
  - User rights and data deletion
  - Cookie policy (if applicable)
- **Terms of Service**:
  - Acceptable use policy
  - Repository submission guidelines
  - Content moderation policy
  - Limitation of liability
  - DMCA compliance procedures
- **Data Handling**:
  - No personal data storage beyond session tokens
  - Clear data retention policies
  - GDPR compliance considerations
  - Data processing agreements with GitHub

## Community Management
- **Contribution Guidelines**:
  - Code of conduct for community interactions
  - Repository submission criteria
  - Content moderation process
  - Issue reporting guidelines
- **Support Workflow**:
  - Support request triage process
  - Response time targets (48 hours for critical issues)
  - Community support channels (GitHub Issues, Discord, etc.)
  - Escalation procedures for security issues
- **Moderation System**:
  - Spam detection and prevention
  - Inappropriate content removal
  - Abuse reporting mechanism
  - Moderator guidelines and training

## Progressive Web App (PWA) Considerations
- **PWA Evaluation Criteria**:
  - Offline functionality for cached reports
  - Installability as desktop/mobile app
  - Push notifications for report updates
  - Background sync for repository submissions
- **Implementation Phases**:
  - Phase 1: Service worker for caching
  - Phase 2: Offline report viewing
  - Phase 3: PWA manifest and installability
  - Phase 4: Push notifications (if user demand exists)

## Maintenance
- Update `../repositories.txt` via community PRs and automated submissions
- Keep CDN dependencies updated
- Monitor GitHub API rate limits (though using raw URLs avoids this)
- Regular testing against real repositories
- **Testing Maintenance**:
  - Keep Bun and Playwright updated
  - Maintain test fixtures and sample data
  - Update tests to match application changes
  - Monitor test coverage and flaky tests
  - Update CI/CD test workflows as needed
  - Regular security audits of test infrastructure
- **Repository Submission Maintenance**:
  - Monitor GitHub Actions workflow execution
  - Review and approve/deny repository additions if needed
  - Handle abuse and spam submissions
  - Monitor GitHub API usage and rate limits
  - Maintain repository submission documentation
  - Update user-provided workflow template as needed
  - Audit repository additions for quality and relevance
  - Monitor OAuth app usage and security
  - Handle OAuth app registration and configuration
  - Manage OAuth Client Secret rotation (quarterly)
- **Monitoring Maintenance**:
  - Review Sentry error reports daily
  - Monitor performance metrics weekly
  - Check GitHub API rate limit usage
  - Review CDN health and performance
  - Analyze user analytics monthly
  - Update monitoring alerts as needed
- **Security Maintenance**:
  - Monthly security reviews of OAuth implementation
  - Quarterly GitHub Actions workflow security audits
  - Regular dependency vulnerability scanning
  - Annual penetration testing
  - Security incident response plan updates
- **Backup Maintenance**:
  - Verify backup integrity weekly
  - Test disaster recovery procedures monthly
  - Update backup retention policies quarterly
  - Review backup encryption and access controls

## Success Metrics
- Successful report rendering from various repositories
- Fast page load times (< 3 seconds)
- Mobile responsiveness
- Error handling for missing/malformed data
- Easy local testing workflow
- **Testing Metrics**:
  - 80%+ unit test coverage for core logic
  - All critical user flows covered by integration tests
  - Main user journeys covered by E2E tests
  - Tests run in under 30 seconds for rapid feedback
  - Zero flaky tests in CI/CD pipeline
  - OAuth and submission flows fully tested
- **Performance Metrics**:
  - Initial page load: < 3 seconds (95th percentile)
  - Time to Interactive: < 5 seconds (95th percentile)
  - First Contentful Paint: < 1.5 seconds (95th percentile)
  - Search response time: < 200ms (95th percentile)
  - Report rendering time: < 2 seconds (95th percentile)
  - Lighthouse performance score: > 90
- **Security Metrics**:
  - Zero critical security vulnerabilities
  - OAuth token zero-day exposure time
  - 100% of repository additions audited
  - Zero unauthorized repository additions
- **Reliability Metrics**:
  - 99.9% uptime for GitHub Pages
  - < 1% error rate for API calls
  - < 5 minute recovery time for backups
  - 100% backup success rate
- **User Experience Metrics**:
  - < 5% bounce rate on landing page
  - > 70% successful repository submissions
  - < 10 second average submission completion time
  - > 4.5/5 user satisfaction score
- **Community Metrics**:
  - Number of repositories in listing
  - Repository submission rate per week
  - Community contribution rate
  - Support request resolution time

## Enterprise Deployment Considerations

### GitHub Enterprise Support
- **GitHub Enterprise Cloud**: Full compatibility with enterprise.github.com instances
- **GitHub Enterprise Server (Self-Hosted)**: Support for on-premises deployments
  - Configurable GitHub Enterprise API endpoints
  - Custom raw content URL patterns for self-hosted instances
  - Example: `https://github.enterprise.com/raw/<org>/<repo>/<branch>/.refactorfirst/refactor-first.json`
- **Enterprise Configuration File**: `enterprise-config.json` for custom endpoints
  ```json
  {
    "githubEnterpriseUrl": "https://github.enterprise.com",
    "apiEndpoint": "https://github.enterprise.com/api/v3",
    "rawContentUrl": "https://github.enterprise.com/raw"
  }
  ```

### Custom Domain Configuration
- **CNAME file support**: Standard GitHub Pages custom domain setup
- **SSL/TLS certificates**: Automatic HTTPS with custom domains
- **Subdomain patterns**: `refactorfirst.company.com` or `reports.company.com`
- **DNS configuration documentation**: Step-by-step enterprise DNS setup

### Access Control & Authentication
- **GitHub OAuth integration**: Required authentication for repository submission
  - OAuth 2.0 authorization code flow with PKCE
  - Scopes: `public_repo` and `read:user`
  - Client ID and Client Secret stored as GitHub Secrets
  - Session-based token storage (sessionStorage)
- **GitHub OAuth App Setup**: 
  - Register OAuth App in GitHub organization settings
  - Configure callback URL: `https://refactorfirst.github.io/add-repo/callback`
  - Generate and securely store Client Secret
  - Configure OAuth app permissions and scopes
- **Personal Access Token (PAT) support**: For fetching private repository reports
  - Secure token storage (sessionStorage or encrypted localStorage)
  - Token scope: `repo:read` for private repo access
- **IP whitelisting**: Documentation for enterprise firewall configuration
- **SAML/SSO consideration**: Notes on integration with enterprise SSO

### CI/CD Integration
- **GitHub Actions workflow**: Automated deployment from main branch
  ```yaml
  name: Deploy to GitHub Pages
  on:
    push:
      branches: [main]
  jobs:
    deploy:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: peaceiris/actions-gh-pages@v3
          with:
            github_token: ${{ secrets.GITHUB_TOKEN }}
            publish_dir: ./
  ```
- **Branch protection rules**: Required status checks before deployment
- **Environment-specific configs**: Dev/staging/production configurations
- **Manual approval gates**: For production deployments

### Enterprise Security Enhancements
- **Content Security Policy (CSP)**: Strict CSP headers for enterprise compliance
  ```html
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;">
  ```
- **Subresource Integrity (SRI)**: Hash-based verification for CDN dependencies
- **X-Frame-Options**: Prevent clickjacking attacks
- **X-Content-Type-Options**: Prevent MIME sniffing
- **Referrer-Policy**: Control referrer information
- **Permissions-Policy**: Control browser features

### Monitoring & Analytics
- **GitHub Pages analytics**: Built-in traffic analytics
- **Custom analytics integration**: Google Analytics, Plausible, or enterprise solutions
- **Error tracking**: Sentry or similar for production error monitoring
- **Performance monitoring**: Core Web Vitals tracking
- **Usage metrics**: Track most-viewed repositories and reports

### Branding & Customization
- **Theme customization**: CSS variables for enterprise color schemes
- **Logo replacement**: Easy logo swap for enterprise branding
- **Custom footer**: Enterprise-specific footer content
- **White-label mode**: Remove RefactorFirst branding if needed
- **Configuration file**: `branding-config.json` for easy customization

### Private Repository Support
- **Authenticated fetching**: Support for private repository reports
- **Token management**: Secure PAT handling for private repos
- **Access control**: Only show repositories user has access to
- **Error handling**: Graceful handling of permission errors

### Compliance & Accessibility
- **WCAG 2.1 AA compliance**: Accessibility standards for enterprises
- **GDPR consideration**: No personal data collection by default
- **Privacy policy template**: For custom analytics implementations
- **Accessibility audit**: ARIA labels, keyboard navigation, screen reader support
- **Section 508 compliance**: For US government enterprises

### Dependency Management
- **Self-hosting option**: Option to host JavaScript libraries internally
- **CDN fallback**: Primary/secondary CDN configuration
- **Version pinning**: Strict version requirements for enterprise approval
- **Dependency security**: Regular security audit of CDN dependencies
- **Internal CDN support**: Configuration for enterprise internal CDNs

### Backup & Disaster Recovery
- **Repository backup**: Automated backup of `../repositories.txt` and configurations
- **Git-based versioning**: All content in Git for easy rollback
- **Multi-region deployment**: Option for CDN edge caching in multiple regions
- **Recovery procedures**: Documentation for disaster recovery

### Documentation for Enterprise Setup
- **Enterprise deployment guide**: Step-by-step setup for enterprise environments
- **GitHub Enterprise Server setup**: Specific instructions for self-hosted instances
- **Custom domain guide**: DNS and SSL configuration
- **Security configuration**: CSP, SRI, and other security headers
- **Troubleshooting guide**: Common enterprise deployment issues

### Rate Limiting & Performance
- **Client-side caching**: Reduce redundant GitHub API calls
- **Request throttling**: Respect GitHub API rate limits
- **Offline support**: Service worker for basic offline functionality
- **Performance budgets**: Specific performance targets for enterprise SLAs

### Audit & Governance
- **Change log**: Track configuration changes
- **Approval workflow**: Document approval process for updates
- **Versioning**: Semantic versioning for deployments
- **Rollback procedures**: Quick rollback capability

## Future Enhancements (Out of Scope)
- User authentication for private repositories
- Report comparison between branches
- Historical report tracking
- Advanced filtering and search
- Export functionality
- Integration with CI/CD pipelines
- Real-time report updates via webhooks
- Multi-language support
- Advanced visualization options
