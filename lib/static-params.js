// Static route parameter lists derived from the repository listing. Pure
// functions so they are unit-testable with fixture data; the app routes
// feed them `loadListedRepositories()` from lib/repositories.js.

export function userStaticParams(repositories) {
  const usernames = [...new Set(repositories.map(r => r.username))];
  return usernames.map(username => ({ username }));
}

export function reportStaticParams(repositories) {
  return repositories.map(({ username, repository }) => ({ username, repository }));
}

// Branch pages are pre-generated for the common default branches; any other
// branch deep link is handled client-side by the not-found redirect.
export function branchStaticParams(repositories) {
  return repositories.flatMap(({ username, repository }) =>
    ['main', 'master'].map(branch => ({ username, repository, branch }))
  );
}
