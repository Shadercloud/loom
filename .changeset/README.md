# Changesets

This folder holds the pending release notes. Anything that changes a published
package needs one:

```sh
pnpm changeset
```

Pick the packages, pick the bump, write one user-facing sentence. The file it
writes goes in with your PR.

All published packages move together (`fixed` in `config.json`), so a bump to
one bumps them all — the workspace is a single coherent runtime and mismatched
versions across `@loom-dev/*` are never a supported combination.

On merge to `main`, the release workflow opens (or refreshes) a **Version
Packages** PR. Merging *that* publishes to npm and tags the release.
