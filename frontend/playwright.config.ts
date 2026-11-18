import { defineConfig, devices } from '@playwright/test';

// Na CI, o Chromium do Playwright. Localmente, PW_CHANNEL=chrome usa o Chrome instalado.
const canal = process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {};
const BANCO = 'mongodb://localhost:27017/cadastro_e2e?directConnection=true';

export default defineConfig({
  testDir: 'e2e',
  // O fluxo começa do primeiro acesso, num banco zerado: os passos dependem uns dos outros.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4175',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    ...canal,
  },
  webServer: [
    {
      // Aplica o schema, limpa o banco de teste (o script recusa banco que não seja de teste
      // local) e sobe a API.
      command: 'npx prisma db push --skip-generate && npx tsx scripts/limpar-banco-de-teste.ts && npx tsx src/server.ts',
      cwd: '../backend',
      url: 'http://127.0.0.1:3334/api/saude',
      env: { DATABASE_URL: BANCO, PORT: '3334', COOKIE_SEGURO: 'false', NODE_ENV: 'test' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run build && npx vite preview --port 4175 --strictPort',
      url: 'http://localhost:4175',
      env: { API_URL: 'http://127.0.0.1:3334' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
