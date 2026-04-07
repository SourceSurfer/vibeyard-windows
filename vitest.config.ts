import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: [
        'src/main/**/*.ts',
        'src/renderer/**/*.ts',
      ],
      exclude: [
        'src/main/main.ts',
        'src/main/ipc-handlers.ts',
        'src/main/mcp-ipc-handlers.ts',
        'src/main/menu.ts',
        'src/main/mcp-client.ts',
        'src/renderer/index.ts',
        'src/renderer/components/**',
        'src/renderer/keybindings.ts',
        'src/renderer/notification-sound.ts',
        'src/renderer/git-status.ts',
        'src/preload/**',
      ],
    },
  },
});
