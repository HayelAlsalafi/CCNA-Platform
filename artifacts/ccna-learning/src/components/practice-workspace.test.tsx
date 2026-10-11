// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PracticeWorkspace } from './practice-workspace';
import { refreshCatalog } from '../lib/catalog-cache';
const identity = { userId: 'admin-a', sessionId: 'session-a' };
vi.mock('@clerk/react', () => ({ useAuth: () => ({
  isLoaded: true, isSignedIn: true, userId: 'admin-a', sessionId: 'session-a',
}) }));
const topic = { id: 'topic-a', slug: 'demo', name: 'Demo', description: '', displayOrder: 0, questionCount: 1 };
const original = {
  id: 'question-a', deliveryId: 'delivery-a', revisionId: 'revision-a', expiresAt: '2026-10-12T10:00:00Z', questionCode: 'CCNA-Q-000001', topicId: 'topic-a',
  text: 'Interface demo', difficulty: 'EASY', type: 'MULTIPLE_CHOICE_SINGLE',
  options: [{ optionKey: 'A', text: 'Demo A' }, { optionKey: 'B', text: 'Demo B' }],
};
const grade = { isCorrect: true, correctOption: { optionKey: 'A', text: 'Demo A' }, explanation: 'Demo explanation' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
let client: QueryClient, root: Root, container: HTMLDivElement;
let topics: typeof topic[], question: typeof original;
let pendingRead: ReturnType<typeof deferred<Response>> | null;
let pendingAnswer: ReturnType<typeof deferred<Response>> | null;
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const element = <T extends HTMLElement>(testId: string) => {
  const el = container.querySelector<T>('[data-testid="' + testId + '"]');
  if (!el) throw Error('Missing ' + testId); return el;
};
async function selectAnswer() {
  await act(async () => { container.querySelector<HTMLInputElement>('input[value="A"]')!.click(); });
}
async function refresh() { await act(async () => { await refreshCatalog(client, identity, () => true); }); }
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  notifyManager.setScheduler(queueMicrotask);
  topics = [topic]; question = structuredClone(original); pendingRead = null; pendingAnswer = null;
  window.history.replaceState({}, '', '/practice?topicId=topic-a');
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/topics') return Promise.resolve(json(topics));
    if (url === '/api/practice/topics/topic-a/question') {
      if (pendingRead) { const p = pendingRead; pendingRead = null; return p.promise; }
      return Promise.resolve(json(question));
    }
    if (url === '/api/practice/questions/question-a/answer') {
      if (pendingAnswer) { const p = pendingAnswer; pendingAnswer = null; return p.promise; }
      return Promise.resolve(json(grade));
    }
    return Promise.reject(Error('Unexpected request: ' + url));
  }));
  await act(async () => { root.render(<QueryClientProvider client={client}>
    <PracticeWorkspace isAuthLoaded isSignedIn />
  </QueryClientProvider>); });
});
afterEach(async () => {
  await act(async () => root.unmount()); client.clear(); container.remove();
  vi.unstubAllGlobals(); notifyManager.setScheduler(callback => setTimeout(callback, 0));
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

it('clears a selected option when a catalog edit changes the delivered question', async () => {
  await selectAnswer();
  expect(element<HTMLButtonElement>('button-submit-answer').disabled).toBe(false);
  question = { ...question, text: 'Updated interface demo', options: [{ optionKey: 'A', text: 'New A' }, { optionKey: 'B', text: 'New B' }] };
  await refresh();
  expect(element('text-practice-question').textContent).toBe('Updated interface demo');
  expect(container.querySelector<HTMLInputElement>('input[value="A"]')!.checked).toBe(false);
  expect(element<HTMLButtonElement>('button-submit-answer').disabled).toBe(true);
});

it('hides retained delivery and answer feedback when its topic is disabled', async () => {
  await selectAnswer();
  await act(async () => element<HTMLButtonElement>('button-submit-answer').click());
  expect(element('result-practice-answer').textContent).toContain('Correct answer');
  topics = []; await refresh();
  expect(container.querySelector('[data-testid="panel-practice-question"]')).toBeNull();
  expect(container.querySelector('[data-testid="result-practice-answer"]')).toBeNull();
  expect(container.textContent).toContain('no longer active');
});

it('hides the old question during a catalog refetch, then preserves selection if content is unchanged', async () => {
  await selectAnswer();
  const pending = deferred<Response>(); pendingRead = pending;
  let refreshing!: Promise<void>;
  await act(async () => { refreshing = refreshCatalog(client, identity, () => true); await Promise.resolve(); });
  expect(container.querySelector('[data-testid="button-submit-answer"]')).toBeNull();
  expect(element('loading-practice-question')).toBeTruthy();
  await act(async () => { pending.resolve(json(question)); await refreshing; });
  expect(container.querySelector<HTMLInputElement>('input[value="A"]')!.checked).toBe(true);
});

it('does not attach a delayed accepted answer to an edited delivery', async () => {
  const pending = deferred<Response>(); pendingAnswer = pending;
  await selectAnswer(); await act(async () => element<HTMLButtonElement>('button-submit-answer').click());
  question = { ...question, text: 'Updated after submission' }; await refresh();
  await act(async () => { pending.resolve(json(grade)); });
  expect(element('text-practice-question').textContent).toBe('Updated after submission');
  expect(container.querySelector('[data-testid="result-practice-answer"]')).toBeNull();
  expect(element<HTMLButtonElement>('button-submit-answer').disabled).toBe(true);
});

it('does not resurrect an old result if content changes and later returns to its earlier text', async () => {
  const pending = deferred<Response>(); pendingAnswer = pending;
  await selectAnswer(); await act(async () => element<HTMLButtonElement>('button-submit-answer').click());
  question = { ...original, text: 'Intermediate edit' }; await refresh();
  question = structuredClone(original); await refresh();
  await act(async () => { pending.resolve(json(grade)); });
  expect(container.querySelector('[data-testid="result-practice-answer"]')).toBeNull();
});


it('submits the exact server-issued delivery and excludes client grading/identity', async () => {
  await selectAnswer(); await act(async () => element<HTMLButtonElement>('button-submit-answer').click());
  const call = vi.mocked(fetch).mock.calls.find(([url]) => url === '/api/practice/questions/question-a/answer');
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({ optionKey: 'A', deliveryId: 'delivery-a' });
});
it('clears a selection when a new delivery has identical question content', async () => {
  await selectAnswer(); question = { ...question, deliveryId: 'delivery-new' }; await refresh();
  expect(container.querySelector<HTMLInputElement>('input[value="A"]')!.checked).toBe(false);
  expect(element<HTMLButtonElement>('button-submit-answer').disabled).toBe(true);
});
it('offers a fresh delivery after a 409 without silently resubmitting', async () => {
  const pending = deferred<Response>(); pendingAnswer = pending;
  await selectAnswer(); await act(async () => element<HTMLButtonElement>('button-submit-answer').click());
  await act(async () => { pending.resolve(new Response(JSON.stringify({ error: { code: 'DELIVERY_EXPIRED', message: 'Expired' } }), { status: 409, headers: { 'content-type': 'application/json' } })); });
  expect(element('error-practice-submit').textContent).toContain('Load a fresh question');
  expect(element('button-retry-submit-answer').textContent).toContain('Load fresh question');
  question = { ...question, deliveryId: 'replacement' };
  await act(async () => element<HTMLButtonElement>('button-retry-submit-answer').click());
  expect(element<HTMLButtonElement>('button-submit-answer').disabled).toBe(true);
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === '/api/practice/questions/question-a/answer')).toHaveLength(1);
});
