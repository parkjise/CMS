import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./__tests__/setup.ts'],
    include: ['__tests__/**/*.test.{ts,tsx}'],
    // 테스트 하나 제한 5초 → 15초 (T-114-A). CI frontend 단계는 앱 테스트를 동시에 돌려(pnpm -r)
    // 평소 0.2초 걸리는 화면 테스트도 바쁠 때 5초를 넘겨 가끔 실패했다.
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
})
