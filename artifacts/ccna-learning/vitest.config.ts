import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  envDir: false,
  root: fileURLToPath(new URL("../../", import.meta.url)),
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@workspace/api-zod': fileURLToPath(new URL('../../lib/api-zod/src/index.ts', import.meta.url)), '@workspace/api-client-react': fileURLToPath(new URL('../../lib/api-client-react/src/index.ts', import.meta.url)), '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    // Bound CPU/memory contention; keep all existing test and hook deadlines.
    maxWorkers: 2, environment: 'node', include: ['artifacts/ccna-learning/src/**/*.test.ts', 'artifacts/ccna-learning/src/**/*.test.tsx'] },
});
