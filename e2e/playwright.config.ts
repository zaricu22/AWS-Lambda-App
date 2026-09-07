import { defineConfig, devices } from '@playwright/test';

// Assumes AuthStack/DataStack/BackendStack are already deployed (real
// Cognito + DynamoDB + Lambda behind API Gateway -- no local emulator for
// any of them here) and `ng serve` is running on :4200 per the root
// README's "Local development" section.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env['BASE_URL'] ?? 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
