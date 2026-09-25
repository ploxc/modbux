import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    setupFiles: './vitest.setup.ts',
    // The Playwright specs are named *.spec.ts and vitest would otherwise try
    // to run them; the fixtures beside them are plain TypeScript and worth unit
    // testing. `tmp/` is scratch, gitignored, and a test left there by an agent
    // or the audit skill is not the suite's.
    exclude: ['e2e/specs/**', 'node_modules/**', 'tmp/**']
  },
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src')
    }
  }
})
