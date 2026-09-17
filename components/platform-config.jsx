'use client';

// Deployment config provided to client components: hosting environment,
// platform API base URL (self-managed GitLab) and the submission target
// (the listing repository whose issue tracker collects new submissions).
// Values come from <meta> tags in the exported HTML so self-managed
// deployments keep working by editing the layout, exactly as before;
// a Server Component or test can override them via the `value` prop.

import { createContext, useContext, useMemo } from 'react';
import { DEFAULT_SUBMISSION_TARGET } from '../lib/repo-submission';
import { detectHostingEnvironment, getPlatformBaseUrl, getSubmissionTarget, readMetaTag } from '../lib/host';

const PlatformConfigContext = createContext(null);

function detectConfig() {
  const environment = detectHostingEnvironment(window.location.hostname);
  return {
    environment,
    platformBaseUrl: getPlatformBaseUrl(readMetaTag) || null,
    submissionTarget: getSubmissionTarget(readMetaTag) || DEFAULT_SUBMISSION_TARGET
  };
}

export function PlatformConfigProvider({ value, children }) {
  const resolved = useMemo(() => {
    const detected = typeof window === 'undefined' ? {} : detectConfig();
    return value || detected;
  }, [value]);
  return (
    <PlatformConfigContext.Provider value={resolved}>
      {children}
    </PlatformConfigContext.Provider>
  );
}

export function usePlatformConfig() {
  const context = useContext(PlatformConfigContext);
  if (context !== null) return context;
  return typeof window === 'undefined'
    ? { environment: 'github', platformBaseUrl: null, submissionTarget: DEFAULT_SUBMISSION_TARGET }
    : detectConfig();
}
