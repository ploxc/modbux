import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    exclude: ['e2e/**', 'node_modules/**']
  },
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@shared': resolve('src/shared'),
      '@backend': resolve('src/backend'),
      '@renderer': resolve('src/renderer/src'),
      '@preload': resolve('src/preload')
    }
  }
})
