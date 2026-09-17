'use client';

// Repository submission form (/add-repo). Validates input inline, checks the
// target repository for a published report, then hands off to a pre-filled
// platform issue in a new tab — no login or tokens on this site; the issue
// author is the submitter identity (checked in CI).

import { useState } from 'react';
import { validateRepositoryInput, submitRepository, platformLabel } from '../lib/repo-submission';
import { logError } from '../lib/error-handler';
import { usePlatformConfig } from './platform-config';

export default function RepoSubmissionForm({ onExternalRedirect }) {
  const { environment, platformBaseUrl, submissionTarget } = usePlatformConfig();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState({ kind: 'idle', html: '', text: '' });

  // Successful submissions open the pre-filled issue in a new tab.
  const externalRedirect =
    onExternalRedirect || (url => window.open(url, '_blank', 'noopener,noreferrer'));

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const owner = form.querySelector('#repo-owner').value;
    const repo = form.querySelector('#repo-name').value;

    const validation = validateRepositoryInput(owner, repo);
    if (!validation.valid) {
      setStatus({ kind: 'error', text: validation.errors.join('. ') });
      return;
    }

    setPending(true);
    setStatus({ kind: 'pending', text: 'Validating repository...' });
    try {
      const result = await submitRepository({ owner, repo }, {
        environment,
        baseUrl: platformBaseUrl,
        target: submissionTarget
      });
      if (result.success && result.issueUrl) {
        // Popup blockers may swallow window.open after async work, so the
        // status message always carries the clickable issue link.
        setStatus({
          kind: 'success',
          issueUrl: result.issueUrl,
          text: result.message
        });
        externalRedirect(result.issueUrl);
      } else {
        setStatus({ kind: 'error', text: result.message });
      }
    } catch (error) {
      logError(error, { route: 'add-repo' });
      setStatus({ kind: 'error', text: error.message });
    } finally {
      setPending(false);
    }
  }

  const label = platformLabel(environment);

  return (
    <section className="add-repo-page content-page">
      <h1>Add Your Repository</h1>
      <p className="info">
        Only repositories with a <code>.refactorfirst/refactor-first.json</code> file
        can be added. After the check, a pre-filled {label} issue opens in a new tab
        &mdash; submit it there and your {label} account will be recorded as the
        submitter. No login or tokens are needed on this site.
      </p>
      <form id="repo-form" noValidate onSubmit={handleSubmit}>
        <label htmlFor="repo-owner">User/Organization Name</label>
        <input id="repo-owner" name="owner" type="text" required autoComplete="off" />
        <label htmlFor="repo-name">Repository Name</label>
        <input id="repo-name" name="repository" type="text" required autoComplete="off" />
        <button type="submit" disabled={pending}>Submit Repository</button>
      </form>
      <p
        className={`form-status${status.kind === 'success' ? ' success' : ''}${status.kind === 'error' ? ' error' : ''}`}
        role="status"
        aria-live="polite"
      >
        {status.kind === 'success' ? (
          <>
            {status.text}{' '}
            <a className="cta" href={status.issueUrl} target="_blank" rel="noopener noreferrer">
              Continue on {label}
            </a>
          </>
        ) : (
          status.text
        )}
      </p>
    </section>
  );
}
