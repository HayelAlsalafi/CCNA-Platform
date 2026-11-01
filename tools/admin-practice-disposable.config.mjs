import config from "./admin-unit.config.mjs";
export default {
  ...config,
  test: {
    ...config.test,
    include: ["tools/admin-practice-disposable.db.test.ts"],
    exclude: [],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
};
