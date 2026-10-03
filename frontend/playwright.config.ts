import { defineConfig, devices } from "@playwright/test";

const uv = process.env.UV_CMD ?? "python -m uv";
const env = process.env as Record<string, string>;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    ...devices["Pixel 7"],
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `${uv} run python scripts/prepare_e2e_db.py && ${uv} run uvicorn app.main:app --port 8010`,
      cwd: "../backend",
      url: "http://localhost:8010/health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...env,
        DATABASE_URL: "postgresql+psycopg://finanzas:finanzas@localhost:5434/finanzas_e2e",
        AI_PARSER: "fake",
        ALLOWED_ORIGIN: "http://localhost:3100",
        COOKIE_SECURE: "false",
        CRON_TOKEN: "e2e-cron-token",
        ENVIRONMENT: "development",
        LOGIN_RATE_LIMIT_PER_MINUTE: "1000",
        LOGIN_EMAIL_RATE_LIMIT_PER_MINUTE: "1000",
      },
    },
    {
      command: "npm run dev -- --port 3100",
      url: "http://localhost:3100/login",
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...env, BACKEND_URL: "http://localhost:8010" },
    },
  ],
});
