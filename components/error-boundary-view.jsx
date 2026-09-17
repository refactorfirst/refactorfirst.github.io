'use client';

// Shared view for route error boundaries (app/error.jsx etc.): maps any
// captured error through lib/error-handler.js so the copy, classification
// and retry affordance match the legacy inline error pages.

import { useEffect } from 'react';
import { errorPageHtml, logError } from '../lib/error-handler';

export default function ErrorBoundaryView({ error, reset }) {
  useEffect(() => {
    logError(error, { route: 'error-boundary' });
  }, [error]);

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <div dangerouslySetInnerHTML={{ __html: errorPageHtml(error || new Error('Unknown error')) }} />
      <p className="error-actions">
        <button type="button" onClick={() => reset()}>Retry</button>
      </p>
    </>
  );
}
