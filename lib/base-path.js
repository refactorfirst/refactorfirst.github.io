// basePath support: forks may deploy to a project page (user.github.io/repo),
// served under NEXT_PUBLIC_BASE_PATH. next/link handles this automatically
// for navigation; raw asset URLs (<img src>, fetch("/...")) must be prefixed
// explicitly via the helpers below.

export function getBasePath() {
  return process.env.NEXT_PUBLIC_BASE_PATH || '';
}

// Prefix a root-relative path with the configured basePath.
export function withBasePath(path) {
  if (!path.startsWith('/')) return path;
  return `${getBasePath()}${path}`;
}
