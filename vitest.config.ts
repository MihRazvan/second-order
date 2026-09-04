import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/core',
      'packages/contracts',
      'data/replays',
      'apps/stream',
    ],
  },
});
