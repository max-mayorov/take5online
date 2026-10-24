# Notes for Claude

- Always run `pnpm e2e` before committing. CI skips E2E on pull requests (it is too slow), so a
  broken E2E test would otherwise only show up after merging to `main`, where it blocks the deploy.
- The full local check is `pnpm format:check && pnpm typecheck && pnpm test && pnpm e2e`.
