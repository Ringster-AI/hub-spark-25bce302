import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Tests do not load the application Vite plugins or its production .env file.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  envDir: fileURLToPath(new URL('./tests/demo/fixtures', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { env: {}, maxWorkers: 2, minWorkers: 1 },
});
