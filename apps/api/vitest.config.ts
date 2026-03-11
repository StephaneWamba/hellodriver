import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
    },
    // Isolate each test file
    pool: 'forks',
    // Skip integration tests in CI unless explicitly enabled
    exclude: process.env.CI && process.env.RUN_INTEGRATION_TESTS !== 'true'
      ? ['src/**/*.integration.test.ts', 'node_modules']
      : ['node_modules'],
  },
});
