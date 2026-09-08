import { defineConfig } from 'vitest/config'

// This relay is its own standalone npm package (not part of the root repo's
// pnpm workspace — see pnpm-workspace.yaml), but it's nested under the main
// repo's directory tree with no vitest.config.ts of its own. Without one,
// Vite's config search climbs up from cwd and picks up the ROOT repo's
// vitest.config.ts instead (its `setupFiles: ['./tests/setup/bedrockGuard.ts']`
// then fails to resolve — that path doesn't exist under this package). This
// file stops that climb so `npm test` / `npx vitest run` work when invoked
// from this directory, per its own package.json and independent of the
// parent app's test setup.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
