'use client';

import { useEffect, useState } from 'react';
import { detectHostingEnvironment } from '../lib/host.js';
import { withBasePath } from '../lib/base-path';

// Loads the CI workflow sample matching the deployment's hosting environment
// into the Getting Started page, so users only see instructions for their
// platform. Environment is resolved client-side (hostname-dependent).
export default function WorkflowSample({ environment: environmentProp }) {
  const [html, setHtml] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const environment = environmentProp
      || detectHostingEnvironment(typeof window !== 'undefined' ? window.location.hostname : null);
    fetch(withBasePath(`/templates/workflow-sample-${environment}.html`))
      .then(response => {
        if (!response.ok) {
          const error = new Error(`Failed to load workflow sample (${response.status})`);
          error.status = response.status;
          throw error;
        }
        return response.text();
      })
      .then(text => { if (!cancelled) setHtml(text); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [environmentProp]);

  if (failed) {
    return (
      <p className="form-status error">
        The workflow sample for this environment could not be loaded. See the repository
        README for manual setup instructions.
      </p>
    );
  }
  if (html === null) return null;
  // Sample fragments are first-party static files under /templates/.
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
