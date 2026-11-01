import config from './admin-unit.config.mjs';
export default {
  ...config,
  test: {
    ...config.test,
    include: ['tools/question-bank-disposable.db.test.ts'],
    exclude: [],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
};
