import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/data-isolation.test.ts', 'tests/dashboard.test.ts', 'tests/next-case-focus.test.ts', 'tests/stories.test.ts', 'tests/rubric.test.ts'],
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
