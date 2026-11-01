import base from './admin-unit.config.mjs';
export default {...base,test:{...base.test,exclude:[],include:['tools/lesson-activation/isolated.db.test.ts']}};
