import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.js', '**/scripts/**'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'coverage/**',
        'dist/**',
        '**/[.]**',
        'packages/*/test?(s)/**',
        '**/*.d.ts',
        '**/*{.,-}test.ts',
        '**/*{.,-}spec.ts',
        '**/__tests__/**',
        '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
        '**/.{eslint,prettier,mocha,stylelint}rc.{js,cjs,yml}',
        'scripts/**',
      ],
    },
    setupFiles: './tests/setup.ts',
    clearMocks: true,
    restoreMocks: true,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
