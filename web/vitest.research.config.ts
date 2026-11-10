import { defineConfig } from 'vitest/config'

/** Araştırma betikleri (liste iyileştirme/keşif): npx vitest run -c vitest.research.config.ts */
export default defineConfig({
  test: { include: ['research/**/*.research.ts'], testTimeout: 3_600_000, hookTimeout: 600_000, environment: 'node' },
})
