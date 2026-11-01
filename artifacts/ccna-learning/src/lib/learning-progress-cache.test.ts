import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver, MutationObserver } from '@tanstack/react-query';
import {
  getSubmitPracticeAnswerMutationOptions,
  type LearningProgressResponse,
} from '@workspace/api-client-react';
import {
  learningProgressKey,
  learningProgressQueryOptions,
  practiceProgressMutationOptions,
  progressIdentity,
  removeOtherProgress,
  removeProgress,
  sessionQueryKey,
} from './learning-progress-cache';

const a = { userId: 'learner-a', sessionId: 'session-a' };
const b = { userId: 'learner-b', sessionId: 'session-b' };
const initial: LearningProgressResponse = {
  summary: {
    totalAttempts: 3,
    correctAttempts: 2,
    overallAccuracy: 66.67,
    uniqueQuestionsAttempted: 1,
    availableQuestionCount: 1,
    coveredQuestionCount: 1,
    coveragePercent: 100,
  },
  topics: [
    {
      topicId: '11111111-1111-4111-8111-111111111111',
      topicName: 'Routing',
      status: 'ACTIVE',
      displayOrder: 1,
      totalAttempts: 3,
      correctAttempts: 2,
      accuracy: 66.67,
      uniqueQuestionsAttempted: 1,
      availableQuestionCount: 1,
      coveredQuestionCount: 1,
      coveragePercent: 100,
    },
  ],
};
const updated: LearningProgressResponse = {
  ...initial,
  summary: {
    ...initial.summary,
    totalAttempts: 4,
    correctAttempts: 3,
    overallAccuracy: 75,
  },
  topics: [{ ...initial.topics[0], totalAttempts: 4, correctAttempts: 3, accuracy: 75 }],
};
const answer = {
  isCorrect: true,
  correctOption: { optionKey: 'B', text: 'Correct option' },
  explanation: 'Explanation',
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
let client: QueryClient;
const fetchMock = vi.fn();
let unsubscribers: (() => void)[] = [];

beforeEach(() => {
  client = new QueryClient();
  unsubscribers = [];
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  client.clear();
  vi.unstubAllGlobals();
});
async function observe(identity = a) {
  const observer = new QueryObserver(client, learningProgressQueryOptions(identity));
  unsubscribers.push(observer.subscribe(() => {}));
  await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));
  return observer;
}

describe('Learning progress cache and answer lifecycle', () => {
  it('requires a loaded signed-in user and session identity', () => {
    expect(progressIdentity({ isLoaded: false, isSignedIn: true, ...a })).toBeNull();
    expect(progressIdentity({ isLoaded: true, isSignedIn: false, ...a })).toBeNull();
    expect(progressIdentity({ isLoaded: true, isSignedIn: true, userId: a.userId })).toBeNull();
    expect(progressIdentity({ isLoaded: true, isSignedIn: true, ...a })).toEqual(a);
  });
  it('isolates account and role cache keys across users and sessions', () => {
    const userKey = ['/api/auth/me'];
    expect(sessionQueryKey(userKey, a)).not.toEqual(sessionQueryKey(userKey, b));
    expect(sessionQueryKey(userKey, a)).not.toEqual(
      sessionQueryKey(userKey, { ...a, sessionId: 'new-session' }),
    );
    expect(sessionQueryKey(['/api/admin/access'], a).at(-1)).toEqual(a);
  });
  it('sends a parameter-free authenticated GET, never userId or sessionId in the request', async () => {
    fetchMock.mockResolvedValue(json(initial));
    await client.fetchQuery(learningProgressQueryOptions(a));
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      '/api/learning/progress',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchMock.mock.lastCall?.[1].body).toBeUndefined();
  });
  it('removes only other progress owners, leaving public catalog and the current session intact', () => {
    client.setQueryData(learningProgressKey(a), initial);
    client.setQueryData(learningProgressKey(b), updated);
    client.setQueryData(['/api/topics'], ['public catalog']);
    removeOtherProgress(client, b);
    expect(client.getQueryData(learningProgressKey(a))).toBeUndefined();
    expect(client.getQueryData(learningProgressKey(b))).toEqual(updated);
    expect(client.getQueryData(['/api/topics'])).toEqual(['public catalog']);
  });
  it('clears all private progress on sign-out or unknown identity', () => {
    client.setQueryData(learningProgressKey(a), initial);
    client.setQueryData(learningProgressKey(b), updated);
    removeOtherProgress(client, null);
    expect(client.getQueryCache().findAll({ queryKey: ['/api/learning/progress'] })).toHaveLength(
      0,
    );
  });
  it('does not reuse the previous session data while a new account query is pending', async () => {
    client.setQueryData(learningProgressKey(a), initial);
    fetchMock.mockResolvedValue(
      json({
        summary: {
          ...initial.summary,
          totalAttempts: 0,
          correctAttempts: 0,
          overallAccuracy: 0,
          uniqueQuestionsAttempted: 0,
          coveredQuestionCount: 0,
          coveragePercent: 0,
        },
        topics: [
          {
            ...initial.topics[0],
            totalAttempts: 0,
            correctAttempts: 0,
            accuracy: 0,
            uniqueQuestionsAttempted: 0,
            coveredQuestionCount: 0,
            coveragePercent: 0,
          },
        ],
      }),
    );
    const observer = new QueryObserver(client, learningProgressQueryOptions(b));
    expect(observer.getCurrentResult().data).toBeUndefined();
    expect(observer.getCurrentResult().isPending).toBe(true);
    unsubscribers.push(observer.subscribe(() => {}));
    removeOtherProgress(client, b);
    await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));
    expect(observer.getCurrentResult().data?.summary.totalAttempts).toBe(0);
    expect(client.getQueryData(learningProgressKey(a))).toBeUndefined();
  });
  it('cancels an old request and ignores a late response after an account switch', async () => {
    let resolve!: (response: Response) => void;
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url, options) => {
      signal = options.signal;
      return new Promise<Response>((done) => {
        resolve = done;
      });
    });
    const pending = client.fetchQuery(learningProgressQueryOptions(a)).catch(() => undefined);
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    removeOtherProgress(client, b);
    expect(signal?.aborted).toBe(true);
    resolve(json(initial));
    await pending;
    expect(client.getQueryData(learningProgressKey(a))).toBeUndefined();
    expect(client.getQueryData(learningProgressKey(b))).toBeUndefined();
  });
  it('invalidates and refetches active progress only after a successful real mutation lifecycle', async () => {
    let saved = false;
    fetchMock.mockImplementation(async (url, options) => {
      if (options.method === 'POST') {
        saved = true;
        return json(answer);
      }
      return json(saved ? updated : initial);
    });
    const observer = await observe();
    const mutation = new MutationObserver(
      client,
      getSubmitPracticeAnswerMutationOptions<unknown, typeof a | null>({
        mutation: practiceProgressMutationOptions(client, a),
      }),
    );
    await mutation.mutate({ questionId: 'question-1', data: { optionKey: 'B' } });
    expect(observer.getCurrentResult().data?.summary).toEqual(updated.summary);
    expect(
      fetchMock.mock.calls.filter((call) => call[0] === '/api/learning/progress'),
    ).toHaveLength(2);
    expect(observer.getCurrentResult().data?.summary.uniqueQuestionsAttempted).toBe(1);
    expect(observer.getCurrentResult().data?.summary.coveragePercent).toBe(100);
  });
  it('does not invalidate or update progress after a failed Submit Answer', async () => {
    fetchMock.mockImplementation(async (_url, options) =>
      options.method === 'POST'
        ? json({ error: { code: 'INTERNAL_ERROR', message: 'Submission failed.' } }, 500)
        : json(initial),
    );
    const observer = await observe();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const mutation = new MutationObserver(
      client,
      getSubmitPracticeAnswerMutationOptions<unknown, typeof a | null>({
        mutation: practiceProgressMutationOptions(client, a),
      }),
    );
    await expect(
      mutation.mutate({ questionId: 'question-1', data: { optionKey: 'B' } }),
    ).rejects.toMatchObject({ status: 500 });
    expect(invalidate).not.toHaveBeenCalled();
    expect(observer.getCurrentResult().data).toEqual(initial);
    expect(
      fetchMock.mock.calls.filter((call) => call[0] === '/api/learning/progress'),
    ).toHaveLength(1);
  });
  it('a late submission invalidates its original session, never a newly selected account', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    client.setQueryData(learningProgressKey(b), updated);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const mutation = new MutationObserver(
      client,
      getSubmitPracticeAnswerMutationOptions<unknown, typeof a | null>({
        mutation: practiceProgressMutationOptions(client, a),
      }),
    );
    const pending = mutation.mutate({ questionId: 'question-1', data: { optionKey: 'B' } });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    mutation.setOptions(
      getSubmitPracticeAnswerMutationOptions<unknown, typeof a | null>({
        mutation: practiceProgressMutationOptions(client, b),
      }),
    );
    removeOtherProgress(client, b);
    finish(json(answer));
    await pending;
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({
      queryKey: learningProgressKey(a),
      exact: true,
    });
    expect(client.getQueryData(learningProgressKey(b))).toEqual(updated);
  });
  it('removes an unmounted session without disturbing a new session for the same user', () => {
    const newSession = { ...a, sessionId: 'session-new' };
    client.setQueryData(learningProgressKey(a), initial);
    client.setQueryData(learningProgressKey(newSession), updated);
    removeProgress(client, a);
    expect(client.getQueryData(learningProgressKey(a))).toBeUndefined();
    expect(client.getQueryData(learningProgressKey(newSession))).toEqual(updated);
  });
});


it('clears learner lesson and chapter caches on session change', () => {
  const client = new QueryClient();
  const old = sessionQueryKey(['/api/lessons', 'lesson-a'], a);
  const chapter = sessionQueryKey(['/api/chapters', 'chapter-a', 'lessons'], a);
  const current = sessionQueryKey(['/api/lessons', 'lesson-a'], b);
  client.setQueryData(old, { content: 'old' }); client.setQueryData(chapter, { items: [] });
  client.setQueryData(current, { content: 'current' });
  removeOtherProgress(client, b);
  expect(client.getQueryData(old)).toBeUndefined(); expect(client.getQueryData(chapter)).toBeUndefined();
  expect(client.getQueryData(current)).toEqual({ content: 'current' });
  client.clear();
});
it('removes exam answers/results from old learner sessions while retaining the current actor and public catalog',()=>{
  const oldRun=sessionQueryKey(['/api/exams','old-run'],a);
  const currentRun=sessionQueryKey(['/api/exams','current-run'],b);
  const oldHistory=sessionQueryKey(['/api/exams/history',1],a);
  client.setQueryData(oldRun,{selected:['A'],result:{correct:1}});
  client.setQueryData(oldHistory,{private:true});
  client.setQueryData(currentRun,{selected:['B']});
  client.setQueryData(['/api/curriculum'],{public:true});
  removeOtherProgress(client,b);
  expect(client.getQueryData(oldRun)).toBeUndefined();
  expect(client.getQueryData(oldHistory)).toBeUndefined();
  expect(client.getQueryData(currentRun)).toEqual({selected:['B']});
  expect(client.getQueryData(['/api/curriculum'])).toEqual({public:true});
  removeProgress(client,b);
  expect(client.getQueryData(currentRun)).toBeUndefined();
  expect(client.getQueryData(['/api/curriculum'])).toEqual({public:true});
});
