import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { Router } from 'wouter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard, TopicsPage } from './learning-progress';
import type { LearningProgressResponse } from '@workspace/api-client-react';

const { auth, progress, catalog, refetch } = vi.hoisted(() => ({
  auth: vi.fn(),
  progress: vi.fn(),
  catalog: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock('@clerk/react', () => ({ useAuth: auth }));
vi.mock('@workspace/api-client-react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@workspace/api-client-react')>()),
  useGetLearningProgress: progress,
  useListTopics: catalog,
}));

const documented = [
  ...readFileSync(
    new URL('../../../../docs/api/learning-progress.md', import.meta.url),
    'utf8',
  ).matchAll(/```json\r?\n([\s\S]*?)\r?\n```/g),
].map((match) => JSON.parse(match[1]) as LearningProgressResponse);
const repeated: LearningProgressResponse = {
  summary: {
    ...documented[0].summary,
    uniqueQuestionsAttempted: 1,
    availableQuestionCount: 1,
    coveredQuestionCount: 1,
    coveragePercent: 100,
  },
  topics: [
    {
      ...documented[0].topics[0],
      uniqueQuestionsAttempted: 1,
      availableQuestionCount: 1,
      coveredQuestionCount: 1,
      coveragePercent: 100,
    },
  ],
};
const queryResult = (overrides = {}) => ({
  data: repeated,
  isPending: false,
  isError: false,
  isFetching: false,
  error: null,
  refetch,
  ...overrides,
});
const render = (Page = Dashboard) =>
  renderToStaticMarkup(
    createElement(Router, {
      ssrPath: Page === Dashboard ? '/' : '/topics',
      children: createElement(Page),
    }),
  );
const metric = (html: string, id: string) =>
  html.match(
    new RegExp('data-testid="metric-' + id + '"[\\s\\S]*?class="quick-value">([^<]*)'),
  )?.[1];

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    userId: 'learner-a',
    sessionId: 'session-a',
  });
  progress.mockReturnValue(queryResult());
  catalog.mockReturnValue({
    data: [
      {
        id: repeated.topics[0].topicId,
        slug: 'routing',
        name: 'Old catalog name',
        description: 'Routing topic description.',
        displayOrder: 1,
        questionCount: 999,
        attemptedCount: 999,
        correctCount: 999,
        accuracy: 999,
        averageDurationSeconds: 999,
        progressPercent: 999,
      },
    ],
  });
});

describe('Learning dashboard and topic map', () => {
  it.each([Dashboard, TopicsPage])('waits for Clerk without mounting private queries', (Page) => {
    auth.mockReturnValue({ isLoaded: false, isSignedIn: undefined });
    expect(render(Page)).toContain('loading-progress-auth');
    expect(progress).not.toHaveBeenCalled();
    expect(catalog).not.toHaveBeenCalled();
  });
  it.each([
    { isLoaded: true, isSignedIn: true, userId: null, sessionId: 'session-a' },
    { isLoaded: true, isSignedIn: true, userId: 'learner-a', sessionId: null },
  ])('waits for a complete user and session identity', (state) => {
    auth.mockReturnValue(state);
    expect(render()).toContain('loading-progress-auth');
    expect(progress).not.toHaveBeenCalled();
  });
  it.each([Dashboard, TopicsPage])('requires sign-in and hides cached private data', (Page) => {
    auth.mockReturnValue({ isLoaded: true, isSignedIn: false, userId: null, sessionId: null });
    const html = render(Page);
    expect(html).toContain('progress-sign-in-required');
    expect(html).toContain('href="/sign-in"');
    expect(html).not.toContain('practice attempts recorded');
    expect(progress).not.toHaveBeenCalled();
  });
  it('uses the generated hook with a user/session key and no placeholder retention', () => {
    render();
    const options = progress.mock.lastCall?.[0];
    expect(options.query.queryKey).toEqual([
      '/api/learning/progress',
      { userId: 'learner-a', sessionId: 'session-a' },
    ]);
    expect(options.query).toMatchObject({
      enabled: true,
      retry: false,
      gcTime: 0,
      refetchOnMount: 'always',
    });
    expect(options.query.placeholderData()).toBeUndefined();
    expect(options.request).toEqual({ credentials: 'same-origin', cache: 'no-store' });
  });
  it('shows 3 attempts, 2 correct, 66.67% accuracy and 1 historical question', () => {
    const html = render();
    expect(metric(html, 'total-attempts')).toBe('3');
    expect(metric(html, 'correct-attempts')).toBe('2');
    expect(metric(html, 'unique-historical-questions')).toBe('1');
    expect(metric(html, 'currently-available-questions')).toBe('1');
    expect(html).toContain('66.67%');
    expect(html).not.toContain('>67%<');
    expect(html).not.toContain('999');
    expect(html).not.toContain('Old catalog name');
  });
  it.each([Dashboard, TopicsPage])('does not inflate coverage for repeated attempts', (Page) => {
    const html = render(Page);
    expect(html).toContain('1 of 1 currently available questions covered');
    expect(html).toContain('aria-valuenow="100"');
    expect(html).not.toContain('300%');
    expect(html).toContain('Answer accuracy');
    expect(html).toContain('Current coverage');
  });
  it('keeps topic names, descriptions, practice links and topic map navigation', () => {
    const dashboard = render();
    expect(dashboard).toContain('href="/topics"');
    const map = render(TopicsPage);
    expect(map).toContain('Topic map');
    expect(map).toContain('grid-topics');
    expect(map).toContain('id="routing"');
    expect(map).toContain('Routing fundamentals');
    expect(map).toContain('Routing topic description.');
    expect(map).toContain('href="/practice?topicId=' + repeated.topics[0].topicId + '"');
  });
  it('removes unsupported time, streak and weekly activity indicators', () => {
    const html = render();
    expect(html).not.toMatch(/Study time|Avg\. time|streak|This week|mini-bars/i);
  });
  it.each([Dashboard, TopicsPage])('shows loading while progress is pending', (Page) => {
    progress.mockReturnValue(queryResult({ data: undefined, isPending: true, isFetching: true }));
    expect(render(Page)).toContain('loading-learning-progress');
  });
  it.each([
    [401, 'Your session could not be verified.'],
    [403, 'Access to learning progress was denied.'],
    [500, 'Learning progress could not be loaded.'],
  ])('handles HTTP %s and hides stale metrics', (status, message) => {
    progress.mockReturnValue(queryResult({ isError: true, error: { status } }));
    const html = render();
    expect(html).toContain(message);
    expect(html).toContain('Retry progress');
    expect(html).not.toContain('panel-dashboard-summary');
    expect(html).not.toContain('grid-topics');
    if (status === 401) expect(html).toContain('href="/sign-in"');
    if (status === 403) expect(html).not.toContain('Return to sign in');
  });
  it('retains current catalog counts for a learner with no attempts', () => {
    progress.mockReturnValue(queryResult({ data: documented[1] }));
    const html = render();
    expect(html).toContain('No practice attempts yet.');
    expect(metric(html, 'total-attempts')).toBe('0');
    expect(metric(html, 'currently-available-questions')).toBe('2');
    expect(html).toContain('0 of 2 currently available questions covered');
  });
  it('handles zero available questions without offering unavailable practice', () => {
    const data = structuredClone(repeated);
    data.summary.availableQuestionCount =
      data.summary.coveredQuestionCount =
      data.summary.coveragePercent =
        0;
    data.topics[0].availableQuestionCount =
      data.topics[0].coveredQuestionCount =
      data.topics[0].coveragePercent =
        0;
    progress.mockReturnValue(queryResult({ data }));
    const html = render(TopicsPage);
    expect(html).toContain('No questions are currently available.');
    expect(html).toContain('No available questions in this topic.');
    expect(html).not.toContain('link-practice-topic-');
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it('handles an empty catalog and preserves the top-level practice navigation', () => {
    progress.mockReturnValue(queryResult({ data: documented[6] }));
    const html = render();
    expect(html).toContain('No active topics.');
    expect(html).toContain('href="/practice"');
  });
  it('separates disabled history and current coverage for moved questions', () => {
    progress.mockReturnValue(queryResult({ data: documented[4] }));
    expect(render(TopicsPage)).toContain('1 of 1 currently available questions covered');
    progress.mockReturnValue(queryResult({ data: documented[5] }));
    const html = render(TopicsPage);
    expect(html).toContain('Historical topics');
    expect(html).toContain('Historical / disabled');
    expect(html).toContain('Practice unavailable for this disabled topic.');
  });
  it('uses a fresh key after account or session changes, displaying no prior data while loading', () => {
    render();
    auth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'learner-b',
      sessionId: 'session-b',
    });
    progress.mockReturnValue(queryResult({ data: undefined, isPending: true }));
    const html = render();
    expect(progress.mock.lastCall?.[0].query.queryKey.at(-1)).toEqual({
      userId: 'learner-b',
      sessionId: 'session-b',
    });
    expect(html).not.toContain('practice attempts recorded');
    expect(html).toContain('loading-learning-progress');
  });
  it('keeps progress visible if optional catalog metadata cannot load', () => {
    catalog.mockReturnValue({ data: undefined, isError: true });
    expect(metric(render(), 'total-attempts')).toBe('3');
  });
});
