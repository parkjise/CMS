import { defineConfig, devices } from '@playwright/test'

const PORT = 3000
const BASE_URL = `http://localhost:${PORT}`

// 크로스 앱 전체 시나리오(T-078)는 3개 프론트가 필요하다.
// E2E_FULL_STACK=1 이면 client/admin/superadmin을 함께 기동한다.
// (백엔드 :8000 은 별도 기동 전제 — poetry run uvicorn)
const fullStack = !!process.env.E2E_FULL_STACK

const webServer = fullStack
  ? [
      {
        command: 'pnpm --filter @cms/client dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
      {
        command: 'pnpm --filter @cms/admin dev',
        url: 'http://localhost:3001',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
      {
        command: 'pnpm --filter @cms/superadmin dev',
        url: 'http://localhost:3002',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
    ]
  : {
      command: 'pnpm dev',
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore' as const,
      stderr: 'pipe' as const,
    }

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer,
})
