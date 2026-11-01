import {defineConfig} from 'orval';
import path from 'node:path';
export default defineConfig({
 'study-client':{input:path.resolve(__dirname,'study.openapi.json'),output:{target:path.resolve(__dirname,'../api-client-react/src/study-api/api.ts'),client:'react-query',mode:'split',baseUrl:'/api',clean:false,override:{fetch:{includeHttpResponseReturnType:false},mutator:{path:path.resolve(__dirname,'../api-client-react/src/custom-fetch.ts'),name:'customFetch'}}}},
 'study-zod':{input:path.resolve(__dirname,'study.openapi.json'),output:{target:path.resolve(__dirname,'../api-zod/src/study/api.ts'),client:'zod',mode:'single',clean:false,override:{zod:{version:3}}}},
});
