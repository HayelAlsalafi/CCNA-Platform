import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Router } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoricalReview, PracticeHistoryPage } from './practice-history';
import { historyPaginationReducer, initialHistoryPagination } from '../lib/history-pagination';

const { auth, historyQuery, refetch } = vi.hoisted(() => ({
  auth: vi.fn(),
  historyQuery: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock('@clerk/react', () => ({ useAuth: auth }));
vi.mock('@workspace/api-client-react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@workspace/api-client-react')>()),
  useGetPracticeHistoryWithDetails: historyQuery,
}));

const attempts = [
  {
    id: 'attempt-1',
    questionId: '11111111-1111-4111-8111-111111111111',
    topicId: '22222222-2222-4222-8222-222222222222',
    questionCode: 'CCNA-Q-000001',
    topicName: 'Network Fundamentals',
    selectedOptionKey: 'B',
    isCorrect: true,
    submittedAt: '2026-10-08T10:30:00.000Z',
  },
  {
    id: 'attempt-2',
    questionId: '33333333-3333-4333-8333-333333333333',
    topicId: '44444444-4444-4444-8444-444444444444',
    questionCode: 'CCNA-Q-000002',
    topicName: 'Routing',
    selectedOptionKey: 'A',
    isCorrect: false,
    submittedAt: '2026-10-07T08:00:00.000Z',
  },
];
const result = (overrides = {}) => ({
  data: { items: attempts, nextCursor: 'older-attempts-cursor' },
  error: null,
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch,
  ...overrides,
});
const render = () =>
  renderToStaticMarkup(
    createElement(Router, {
      ssrPath: '/practice/history',
      children: createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(PracticeHistoryPage),
      ),
    }),
  );
const button = (html: string, testId: string) =>
  html.match(new RegExp('<button[^>]*data-testid="' + testId + '"[^>]*>'))?.[0] ?? '';

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    userId: 'learner-one',
    sessionId: 'session-one',
  });
  historyQuery.mockReturnValue(result());
});

describe('Practice history page', () => {
  it('waits for Clerk without requesting private history', () => {
    auth.mockReturnValue({ isLoaded: false, isSignedIn: undefined, sessionId: undefined });
    expect(render()).toContain('loading-history-auth');
    expect(historyQuery).not.toHaveBeenCalled();
  });

  it('requires sign-in without requesting or showing cached history', () => {
    auth.mockReturnValue({ isLoaded: true, isSignedIn: false, sessionId: null });
    const html = render();
    expect(html).toContain('history-sign-in-required');
    expect(html).toContain('href="/sign-in"');
    expect(html).not.toContain('CCNA-Q-000001');
    expect(historyQuery).not.toHaveBeenCalled();
  });

  it('does not load history without a session identifier', () => {
    auth.mockReturnValue({ isLoaded: true, isSignedIn: true, sessionId: null });
    expect(render()).toContain('history-sign-in-required');
    expect(historyQuery).not.toHaveBeenCalled();
  });

  it('uses the existing hook with a session-scoped query key and no retained cache', () => {
    render();
    const params = { limit: 20, includeDetails: true };
    const identity = { userId: 'learner-one', sessionId: 'session-one' };
    const options = historyQuery.mock.lastCall?.[1];
    expect(historyQuery.mock.lastCall?.[0]).toEqual(params);
    expect(options.query.queryKey).toEqual(['/api/practice/history', params, identity]);
    expect(options.query).toMatchObject({
      enabled: true,
      retry: false,
      gcTime: 0,
      refetchOnMount: 'always',
    });
    expect(options.query.placeholderData()).toBeUndefined();
    expect(options.request).toEqual({ credentials: 'same-origin', cache: 'no-store' });
    auth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'learner-two',
      sessionId: 'session-two',
    });
    render();
    expect(historyQuery.mock.lastCall?.[1].query.queryKey.at(-1)).toEqual({
      userId: 'learner-two',
      sessionId: 'session-two',
    });
  });

  it('shows loading status and disables pagination during a request', () => {
    historyQuery.mockReturnValue(result({ data: undefined, isLoading: true, isFetching: true }));
    const html = render();
    expect(html).toContain('loading-practice-history');
    expect(html).toContain('aria-busy="true"');
    expect(button(html, 'button-history-next')).toContain('disabled');
    expect(button(html, 'button-history-previous')).toContain('disabled');
  });

  it('displays all required fields, repeated questions, correctness and machine-readable dates', () => {
    historyQuery.mockReturnValue(
      result({
        data: {
          items: [
            attempts[0],
            {
              ...attempts[1],
              questionId: attempts[0].questionId,
              questionCode: attempts[0].questionCode,
            },
          ],
          nextCursor: null,
        },
      }),
    );
    const html = render();
    expect(html.match(/data-testid="row-practice-history"/g)).toHaveLength(2);
    expect(html.split('<code>CCNA-Q-000001</code>').length - 1).toBe(2);
    expect(html).toContain('Network Fundamentals');
    expect(html).toContain('Routing');
    for (const attempt of attempts) {
      expect(html).not.toContain(attempt.questionId);
      expect(html).not.toContain(attempt.topicId);
    }
    expect(html).toContain('history-answer">B</span>');
    expect(html).toContain('history-answer">A</span>');
    expect(html).toContain('Correct</span>');
    expect(html).toContain('Incorrect</span>');
    expect(html).toContain('dateTime="2026-10-08T10:30:00.000Z"');
    expect(html).toContain('scope="col"');
    expect(html).toContain('data-label="Question Code"');
  });

  it('handles an empty history and links to Practice', () => {
    historyQuery.mockReturnValue(result({ data: { items: [], nextCursor: null } }));
    const html = render();
    expect(html).toContain('No practice attempts yet.');
    expect(html).toContain('Start practicing');
    expect(html).not.toContain('table-practice-history');
    expect(button(html, 'button-history-next')).toContain('disabled');
  });

  it('enables Next only when the API returns nextCursor', () => {
    expect(button(render(), 'button-history-next')).not.toContain('disabled');
    expect(button(render(), 'button-history-previous')).toContain('disabled');
    historyQuery.mockReturnValue(result({ data: { items: attempts, nextCursor: null } }));
    expect(button(render(), 'button-history-next')).toContain('disabled');
  });

  it('blocks Next during background fetching', () => {
    historyQuery.mockReturnValue(result({ isFetching: true }));
    expect(button(render(), 'button-history-next')).toContain('disabled');
  });

  it('shows API errors with retry and hides stale results', () => {
    historyQuery.mockReturnValue(result({ isError: true, error: { status: 500 } }));
    const html = render();
    expect(html).toContain('error-practice-history');
    expect(html).toContain('button-retry-history');
    expect(html).not.toContain('CCNA-Q-000001');
    expect(button(html, 'button-history-next')).toContain('disabled');
  });

  it('handles an expired session without exposing cached results', () => {
    historyQuery.mockReturnValue(result({ isError: true, error: { status: 401 } }));
    const html = render();
    expect(html).toContain('Your session could not be verified.');
    expect(html).toContain('Return to sign in');
    expect(html).not.toContain('CCNA-Q-000001');
    expect(html).not.toContain('history-pagination');
  });

  it('distinguishes forbidden accounts from expired sessions', () => {
    historyQuery.mockReturnValue(result({ isError: true, error: { status: 403 } }));
    const html = render();
    expect(html).toContain('Access to practice history was denied.');
    expect(html).toContain('Ask an administrator');
    expect(html).not.toContain('Return to sign in');
    expect(html).not.toContain('CCNA-Q-000001');
  });

  it('keeps malformed dates from crashing the page', () => {
    historyQuery.mockReturnValue(
      result({ data: { items: [{ ...attempts[0], submittedAt: 'invalid' }], nextCursor: null } }),
    );
    expect(render()).toContain('Date unavailable');
  });
});

describe('History display details', () => {
  it('keeps the attempt when references are null or absent', () => {
    historyQuery.mockReturnValue(
      result({
        data: {
          items: [
            { ...attempts[0], questionCode: null, topicName: null },
            { ...attempts[1], questionCode: undefined, topicName: undefined },
          ],
          nextCursor: null,
        },
      }),
    );
    const html = render();
    expect(html.match(/data-testid="row-practice-history"/g)).toHaveLength(2);
    expect(html).toContain('Question unavailable');
    expect(html).toContain('Topic unavailable');
    expect(html).not.toContain(attempts[0].questionId);
    expect(html).not.toContain(attempts[1].topicId);
  });

  it('never renders grading explanations or correct answer fields', () => {
    historyQuery.mockReturnValue(
      result({
        data: {
          items: [
            {
              ...attempts[0],
              correctOption: { optionKey: 'D', text: 'SECRET ANSWER' },
              explanation: 'SECRET EXPLANATION',
            },
          ],
          nextCursor: null,
        },
      }),
    );
    expect(render()).not.toMatch(/SECRET ANSWER|SECRET EXPLANATION/);
  });

  it('does not request history without the user identity', () => {
    auth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: null,
      sessionId: 'session-one',
    });
    expect(render()).toContain('history-sign-in-required');
    expect(historyQuery).not.toHaveBeenCalled();
  });
});

describe('History cursor pagination', () => {
  it('uses returned cursors and restores the exact previous cursor', () => {
    const second = historyPaginationReducer(initialHistoryPagination, {
      type: 'next',
      cursor: 'cursor-2',
    });
    const third = historyPaginationReducer(second, { type: 'next', cursor: 'cursor-3' });
    expect(second).toEqual([undefined, 'cursor-2']);
    expect(third).toEqual([undefined, 'cursor-2', 'cursor-3']);
    expect(historyPaginationReducer(third, { type: 'previous' })).toEqual(second);
    expect(historyPaginationReducer(second, { type: 'previous' })).toEqual(
      initialHistoryPagination,
    );
  });

  it('stops at the first page and ignores empty or repeated cursors', () => {
    expect(historyPaginationReducer(initialHistoryPagination, { type: 'previous' })).toBe(
      initialHistoryPagination,
    );
    expect(historyPaginationReducer(initialHistoryPagination, { type: 'next', cursor: '' })).toBe(
      initialHistoryPagination,
    );
    const second = historyPaginationReducer(initialHistoryPagination, {
      type: 'next',
      cursor: 'cursor-2',
    });
    expect(historyPaginationReducer(second, { type: 'next', cursor: 'cursor-2' })).toBe(second);
  });

  it('resets an invalid cursor to the newest page', () => {
    expect(historyPaginationReducer([undefined, 'invalid-cursor'], { type: 'reset' })).toEqual([
      undefined,
    ]);
  });
});


it('reviews only captured question/options/answer context, not current catalog content', () => {
  const item = { ...attempts[0]!, revisionId: 'revision-original', historicalContentStatus: 'VERIFIED_SNAPSHOT' as const,
    review: { text: 'Original delivery text', type: 'MULTIPLE_CHOICE_SINGLE' as const, difficulty: 'EASY' as const, imageKey: null, referenceNotes: 'Original reference', explanation: 'Original rationale',
      options: [{ optionKey: 'A', text: 'Old A' }, { optionKey: 'B', text: 'Old B' }], correctOption: { optionKey: 'B', text: 'Old B' } } };
  const html = renderToStaticMarkup(createElement(HistoricalReview, { item }));
  expect(html).toContain('Original delivery text'); expect(html).toContain('Old B');expect(html).toContain('Your answer');expect(html).toContain('Correct answer');expect(html).toContain('Original rationale');expect(html).toContain('Original reference');
  expect(html).not.toContain('unavailable');
});
it('labels missing legacy content honestly while preserving recorded scores', () => {
  const html = renderToStaticMarkup(createElement(HistoricalReview, { item: { ...attempts[0]!, revisionId: null, historicalContentStatus: 'LEGACY_UNAVAILABLE', review: null } }));
  expect(html).toContain('Original question content is unavailable');expect(html).toContain('recorded score is preserved');expect(html).not.toContain('Review submitted question');
});
