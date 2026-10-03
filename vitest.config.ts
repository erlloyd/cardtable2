import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'app',
      { test: { name: 'server', include: ['server/src/**/*.test.ts'] } },
    ],
  },
});
