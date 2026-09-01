import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    setupFiles: './vitest.setup.ts',
    // Only the Playwright specs are off limits — they are named *.spec.ts and
    // vitest would otherwise try to run them. The fixtures beside them are plain
    // TypeScript and worth unit testing.
    exclude: ['e2e/specs/**', 'node_modules/**']
  },
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src')
    }
  }
})
