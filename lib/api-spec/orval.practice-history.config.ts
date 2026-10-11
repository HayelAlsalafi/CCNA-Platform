import { defineConfig, type InputTransformerFn } from 'orval';
import path from 'node:path';

// Additive generation into dedicated folders; never clean existing clients.
const historyOnly: InputTransformerFn = (document) => {
  const operation = document.paths?.['/practice/history'];
  if (!operation) throw new Error('Required OpenAPI path is missing: /practice/history');
  const schemas = Object.fromEntries(
    ['PracticeHistoryResponse', 'PracticeHistoryItem', 'PracticeRevisionReview', 'PracticeQuestionOption', 'PracticeCorrectOption', 'ErrorResponse'].map((name) => {
      const schema = document.components?.schemas?.[name];
      if (!schema) throw new Error('Required OpenAPI schema is missing: ' + name);
      return [name, schema] as const;
    }),
  );
  return {
    ...document,
    paths: { '/practice/history': operation },
    components: { ...document.components, schemas },
  };
};

const input = {
  target: path.resolve(__dirname, 'openapi.yaml'),
  override: { transformer: historyOnly },
};

export default defineConfig({
  'practice-history-client': {
    input,
    output: {
      target: path.resolve(__dirname, '../api-client-react/src/practice-history/api.ts'),
      client: 'react-query',
      mode: 'split',
      baseUrl: '/api',
      clean: false,
      override: {
        fetch: { includeHttpResponseReturnType: false },
        mutator: {
          path: path.resolve(__dirname, '../api-client-react/src/custom-fetch.ts'),
          name: 'customFetch',
        },
      },
    },
  },
  'practice-history-zod': {
    input,
    output: {
      target: path.resolve(__dirname, '../api-zod/src/practice-history/api.ts'),
      client: 'zod',
      mode: 'single',
      clean: false,
      override: { zod: { version: 3 } },
    },
  },
});
