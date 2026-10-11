// @vitest-environment jsdom
import { act, useEffect, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { AdminQuestionManager } from './admin-questions';
import { AdminTopicManager } from './admin-topics';
import { AdminCacheGuard, AdminSessionBoundary, useAdminSession } from './admin-session-boundary';
import { AdminPage } from '../App';
import { adminAuthState, adminQueryKey, type AdminIdentity } from '../lib/admin-session';

const clerk = vi.hoisted(() => ({ auth: {
  isLoaded: true, isSignedIn: true, userId: 'admin-a' as string | null, sessionId: 'session-a' as string | null,
} }));
vi.mock('@clerk/react', () => ({
  useAuth: () => clerk.auth,
  useUser: () => ({ user: null }),
  useClerk: () => ({ signOut: vi.fn() }),
  ClerkProvider: ({ children }: { children: unknown }) => children,
  SignIn: () => null, SignUp: () => null,
}));

const a = { userId: 'admin-a', sessionId: 'session-a' };
const b = { userId: 'admin-b', sessionId: 'session-b' };
const sameUser = { ...a, sessionId: 'new-session-a' };
const topicId = '11111111-1111-4111-8111-111111111111';
const topic = { id: topicId, slug: 'routing', name: 'Routing', description: '', displayOrder: 0, status: 'ACTIVE', createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z' };
const question = (label: string) => ({
  id: label === 'admin-a' ? '22222222-2222-4222-8222-222222222222' : '33333333-3333-4333-8333-333333333333',
  questionCode: label === 'admin-a' ? 'CCNA-Q-000001' : 'CCNA-Q-000002',
  topicId, text: 'Question for ' + label, type: 'MULTIPLE_CHOICE_SINGLE',
  difficulty: 'MEDIUM', status: 'ACTIVE', explanation: 'Private explanation ' + label,
  referenceNotes: 'Private notes ' + label, imageKey: null,
  createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z',
  options: [
    { optionKey: 'A', text: 'Answer A ' + label, displayOrder: 0, isCorrect: true },
    { optionKey: 'B', text: 'Answer B ' + label, displayOrder: 1, isCorrect: false },
  ],
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
}
let client: QueryClient, root: Root, container: HTMLDivElement;
let nextQuery: ReturnType<typeof deferred<Response>> | null;
let nextWrite: ReturnType<typeof deferred<Response>> | null;
let role: 'ADMIN' | 'USER', accessStatus: number, accessAllowed: boolean;
let calls: { url: string; options: RequestInit }[];
let captured: { run: () => boolean; dispatch: () => void }[];
const dispatchSpy = vi.fn();

function Capture() {
  const scope = useAdminSession();
  useEffect(() => {
    captured.push({ run: scope.capture(), dispatch: () => { if (scope.isCurrent()) dispatchSpy(); } });
  }, [scope]);
  return null;
}
function Managers({ view = 'questions' }: { view?: 'questions' | 'topics' }) {
  const state = adminAuthState(clerk.auth);
  return <>
    <AdminCacheGuard />
    {state.status === 'signed-in' ? <AdminSessionBoundary key={view} identity={state.identity}>
      <Capture />
      {view === 'questions' ? <AdminQuestionManager /> : <AdminTopicManager />}
    </AdminSessionBoundary> : <div data-testid="auth-boundary">{state.status}</div>}
  </>;
}
async function render(view: 'questions' | 'topics' | 'page' | 'none' = 'questions', strict = false) {
  await act(async () => {
    const content = view === 'none' ? null : view === 'page' ? <><AdminCacheGuard /><AdminPage /></> : <Managers view={view} />;
    root.render(<QueryClientProvider client={client}>{strict ? <StrictMode>{content}</StrictMode> : content}</QueryClientProvider>);
  });
}
async function switchTo(identity: AdminIdentity | null, loaded = true) {
  clerk.auth = { isLoaded: loaded, isSignedIn: !!identity, userId: identity?.userId ?? null, sessionId: identity?.sessionId ?? null };
  await render();
}
const find = <T extends Element = HTMLElement>(selector: string) => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error('Missing element: ' + selector);
  return element;
};
async function click(selector: string) { await act(async () => { find<HTMLElement>(selector).click(); }); }
async function button(text: string) {
  const element = [...document.querySelectorAll<HTMLButtonElement>('button')].find(el => el.textContent?.trim() === text);
  if (!element) throw new Error('Missing button: ' + text);
  await act(async () => { element.click(); });
}
async function input(selector: string, value: string) {
  await act(async () => {
    const el = find<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector);
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
const writes = () => calls.filter(call => call.options.method !== 'GET');

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  notifyManager.setScheduler(queueMicrotask);
  clerk.auth = { isLoaded: true, isSignedIn: true, ...a };
  role = 'ADMIN'; accessStatus = 200; accessAllowed = true;
  nextQuery = null; nextWrite = null; calls = []; captured = []; dispatchSpy.mockReset();
  client = new QueryClient();
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  window.history.replaceState({}, '', '/admin/questions');
  vi.stubGlobal('fetch', vi.fn((url: string, options: RequestInit = {}) => {
    calls.push({ url, options });
    if (url === '/api/auth/me') return Promise.resolve(json({ user: { role, status: 'ACTIVE' } }));
    if (url === '/api/admin/access') return Promise.resolve(json(
      accessStatus === 200 ? { allowed: accessAllowed, role: 'ADMIN' } : { error: { code: 'FORBIDDEN' } }, accessStatus));
    if (options.method !== 'GET') {
      if (nextWrite) { const pending = nextWrite; nextWrite = null; return pending.promise; }
      return Promise.resolve(json(url.includes('questions') ? question(clerk.auth.userId ?? 'signed-out') : topic));
    }
    if (url === '/api/admin/topics') return Promise.resolve(json([topic]));
    if (url.startsWith('/api/admin/questions')) {
      if (nextQuery) { const pending = nextQuery; nextQuery = null; return pending.promise; }
      const offset = Number(new URL(url, 'http://localhost').searchParams.get('offset') ?? 0);
      return Promise.resolve(json({ items: [question(clerk.auth.userId ?? 'signed-out')], total: 40, limit: 20, offset }));
    }
    return Promise.resolve(json([]));
  }));
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  client.clear(); container.remove();
  vi.unstubAllGlobals();
  notifyManager.setScheduler(callback => setTimeout(callback, 0));
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('actual admin managers across Clerk transitions', () => {
  it.each([b, sameUser])('clears question editor, filters, targets, and old caches on %j', async identity => {
    await render();
    await button('Edit');
    await input('#filter-question-difficulty', 'HARD');
    expect(find<HTMLTextAreaElement>('#question-explanation').value).toContain('admin-a');
    await button('Disable');
    expect(document.body.textContent).toContain('Disable question CCNA-Q-000001?');
    await switchTo(identity);
    expect(find<HTMLTextAreaElement>('#question-text').value).toBe('');
    expect(find<HTMLTextAreaElement>('#question-explanation').value).toBe('');
    expect(find<HTMLTextAreaElement>('#question-reference-notes').value).toBe('');
    expect(find<HTMLSelectElement>('#question-topic').value).toBe('');
    expect(find<HTMLSelectElement>('#filter-question-difficulty').value).toBe('');
    expect(document.body.textContent).not.toContain('Disable question CCNA-Q-000001?');
    expect(document.body.textContent).not.toContain('Private explanation admin-a');
    expect(client.getQueryData(adminQueryKey(['/api/admin/questions', { limit: 20, offset: 0 }], a))).toBeUndefined();
    await button('Edit');
    await input('#question-text', 'Updated in current session');
    await click('[data-testid="button-save-question"]');
    const write = writes().at(-1)!;
    expect(write.url).toContain(question(identity.userId).id);
    expect(JSON.parse(String(write.options.body)).text).toBe('Updated in current session');
    expect(new Headers(write.options.headers).get('X-Admin-Session')).toBe(identity.sessionId);
  });

  it.each([true, false])('sign-out/loading removes admin UI, cached answers, and stale dispatch (loaded=%s)', async loaded => {
    await render(); await button('Edit');
    const old = captured.at(-1)!;
    await switchTo(null, loaded);
    expect(document.querySelector('[data-testid="admin-question-manager"]')).toBeNull();
    expect(container.textContent).toBe(loaded ? 'signed-out' : 'loading');
    expect(client.getQueryCache().getAll().filter(q => String(q.queryKey[0]).startsWith('/api/admin/'))).toHaveLength(0);
    expect(old.run()).toBe(false);
    old.dispatch();
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });

  it('ignores an A list response after B is active even if transport ignores abort', async () => {
    const pending = deferred<Response>(); nextQuery = pending;
    await render();
    const oldSignal = calls.find(c => c.url.startsWith('/api/admin/questions'))!.options.signal!;
    await switchTo(b);
    expect(container.textContent).toContain('Question for admin-b');
    expect(oldSignal.aborted).toBe(true);
    await act(async () => { pending.resolve(json({ items: [question('admin-a')], total: 1, limit: 20, offset: 0 })); });
    expect(container.textContent).not.toContain('Question for admin-a');
    expect(client.getQueryCache().getAll().some(q => q.state.data && JSON.stringify(q.state.data).includes('Private explanation admin-a'))).toBe(false);
  });

  it.each(['success', 'error', 'conflict'] as const)('ignores delayed A save %s without clearing B draft/feedback', async outcome => {
    await render(); await button('Edit');
    const pending = deferred<Response>(); nextWrite = pending;
    await click('[data-testid="button-save-question"]');
    expect(writes()).toHaveLength(1);
    await switchTo(b);
    await input('#question-text', 'Unsaved B draft');
    const requestsBefore = calls.length;
    await act(async () => {
      pending.resolve(outcome === 'success' ? json(question('admin-a')) : json({ error: { message: 'A-only failure' } }, outcome === 'conflict' ? 409 : 500));
    });
    expect(find<HTMLTextAreaElement>('#question-text').value).toBe('Unsaved B draft');
    expect(document.querySelector('[data-testid="admin-question-notice"]')).toBeNull();
    expect(document.querySelector('[data-testid="admin-question-error"]')).toBeNull();
    expect(container.textContent).not.toContain('A-only failure');
    expect(calls).toHaveLength(requestsBefore);
    expect(client.getMutationCache().getAll()).toHaveLength(0);
  });

  it('does not restore cache or feedback when a pending mutation completes after sign-out', async () => {
    await render(); await button('Edit');
    const pending = deferred<Response>(); nextWrite = pending;
    await click('[data-testid="button-save-question"]');
    await switchTo(null);
    await act(async () => { pending.resolve(json(question('admin-a'))); });
    expect(container.textContent).toBe('signed-out');
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it('rejects old callbacks after leaving and returning to the same session', async () => {
    await render(); const old = captured.at(-1)!;
    await render('none'); await render();
    expect(old.run()).toBe(false);
    old.dispatch(); expect(dispatchSpy).not.toHaveBeenCalled();
    expect(captured.at(-1)!.run()).toBe(true);
  });

  it('retains functionality under React StrictMode effect teardown/replay', async () => {
    await render('questions', true);
    await button('Edit');
    await input('#question-text', 'Strict editor');
    await click('[data-testid="button-save-question"]');
    expect(writes()).toHaveLength(1);
    expect(container.textContent).toContain('updated.');
  });

  it('preserves question listing/filter/pagination/create/disable functionality', async () => {
    await render();
    await input('#filter-question-difficulty', 'HARD');
    expect(calls.some(c => c.url.includes('difficulty=HARD'))).toBe(true);
    await button('Next');
    expect(calls.some(c => c.url.includes('offset=20'))).toBe(true);
    await input('#question-topic', topicId); await input('#question-text', 'New question');
    for (const key of ['A', 'B', 'C', 'D']) await input('[aria-label="Option ' + key + ' text"]', 'Option ' + key);
    await click('[aria-label="Mark option A as correct"]');
    await click('[data-testid="button-save-question"]');
    expect(writes().at(-1)!.url).toBe('/api/admin/questions');
    expect(JSON.parse(String(writes().at(-1)!.options.body))).toMatchObject({ topicId, type: 'MULTIPLE_CHOICE_SINGLE', text: 'New question' });
    expect(container.textContent).toContain('Question created.');
    await button('Disable');
    await click('[data-testid="button-confirm-disable-question"]');
    expect(writes().at(-1)!.url).toBe('/api/admin/questions/' + question('admin-a').id + '/disable');
    expect(container.textContent).toContain('has not been deleted');
    expect(writes().every(call => new Headers(call.options.headers).get('X-Admin-Session') === a.sessionId)).toBe(true);
  });


  it('ignores a delayed topic edit after another admin starts a fresh topic form', async () => {
    await render('topics'); await button('Edit');
    const pending = deferred<Response>(); nextWrite = pending;
    await click('[data-testid="button-save-topic"]');
    clerk.auth = { isLoaded: true, isSignedIn: true, ...b }; await render('topics');
    await input('#topic-name', 'Unsaved B topic');
    const requestsBefore = calls.length;
    await act(async () => { pending.resolve(json(topic)); });
    expect(find<HTMLInputElement>('#topic-name').value).toBe('Unsaved B topic');
    expect(document.querySelector('[data-testid="admin-topic-notice"]')).toBeNull();
    expect(calls).toHaveLength(requestsBefore);
    expect(client.getMutationCache().getAll()).toHaveLength(0);
  });
  it('isolates topic editor and preserves topic create/edit/disable operations', async () => {
    await render('topics'); await button('Edit');
    await input('#topic-name', 'Updated topic'); await click('[data-testid="button-save-topic"]');
    expect(writes().at(-1)!.url).toBe('/api/admin/topics/' + topicId);
    await input('#topic-name', 'New topic'); await input('#topic-slug', 'new-topic');
    await click('[data-testid="button-save-topic"]');
    expect(writes().at(-1)!.url).toBe('/api/admin/topics');
    await button('Disable'); await click('[data-testid="button-confirm-disable"]');
    expect(writes().at(-1)!.url).toBe('/api/admin/topics/' + topicId + '/disable');
    expect(writes().every(call => new Headers(call.options.headers).get('X-Admin-Session') === a.sessionId)).toBe(true);
    await button('Edit');
    clerk.auth = { isLoaded: true, isSignedIn: true, ...b }; await render('topics');
    expect(find<HTMLInputElement>('#topic-name').value).toBe('');
    expect(find<HTMLInputElement>('#topic-slug').value).toBe('');
    expect(document.querySelector('[data-testid="admin-topic-notice"]')).toBeNull();
  });
});

describe('actual server-access UI boundary', () => {
  it.each([b, sameUser])('resets the actual AdminPage editor after identity switch: %j', async identity => {
    await render('page'); await button('Edit');
    clerk.auth = { isLoaded: true, isSignedIn: true, ...identity };
    await render('page');
    expect(find<HTMLTextAreaElement>('#question-text').value).toBe('');
    expect(find<HTMLTextAreaElement>('#question-explanation').value).toBe('');
    expect(document.querySelector('[data-testid="admin-question-notice"]')).toBeNull();
    expect(container.textContent).toContain('Question for ' + identity.userId);
    expect(client.getQueryData(adminQueryKey(['/api/admin/questions', { limit: 20, offset: 0 }], a))).toBeUndefined();
  });

  it('admits resolved ADMIN only after server access succeeds', async () => {
    await render('page');
    expect(document.querySelector('[data-testid="admin-question-manager"]')).not.toBeNull();
    expect(calls.some(c => c.url === '/api/admin/access')).toBe(true);
  });
  it('does not request bank data for a USER', async () => {
    role = 'USER'; await render('page');
    expect(document.querySelector('[data-testid="admin-question-manager"]')).toBeNull();
    expect(container.textContent).toContain('Access denied.');
    expect(calls.some(c => c.url.startsWith('/api/admin/'))).toBe(false);
  });
  it.each([200, 403])('does not mount manager if server access is denied (status=%s)', async status => {
    accessAllowed = false; accessStatus = status; await render('page');
    expect(document.querySelector('[data-testid="admin-question-manager"]')).toBeNull();
    expect(calls.some(c => c.url.startsWith('/api/admin/questions') || c.url === '/api/admin/topics')).toBe(false);
    expect(container.textContent).toContain('server did not grant admin access');
  });
  it.each(['signed-out', 'loading', 'missing-session'])('makes no protected request for %s', async state => {
    clerk.auth = {
      isLoaded: state !== 'loading', isSignedIn: state !== 'signed-out',
      userId: state === 'signed-out' ? null : a.userId,
      sessionId: state === 'missing-session' || state === 'signed-out' ? null : a.sessionId,
    };
    await render('page');
    expect(document.querySelector('[data-testid="admin-question-manager"]')).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

// Frontend isolation evidence only: server authentication is tested separately.
it.each(['questions', 'topics'] as const)('keeps the current %s draft on session conflict without automatic retry', async view => {
  await render(view); await button('Edit');
  const pending = deferred<Response>(); nextWrite = pending;
  const field = view === 'questions' ? '#question-text' : '#topic-name';
  await input(field, 'Unsaved current draft');
  await click(view === 'questions' ? '[data-testid="button-save-question"]' : '[data-testid="button-save-topic"]');
  expect(new Headers(writes().at(-1)!.options.headers).get('X-Admin-Session')).toBe(a.sessionId);
  await act(async () => { pending.resolve(json({ error: { code: 'ADMIN_SESSION_CHANGED', message: 'The active session changed. Refresh before retrying.' } }, 409)); });
  expect(find<HTMLInputElement | HTMLTextAreaElement>(field).value).toBe('Unsaved current draft');
  expect(container.textContent).toContain('Refresh before retrying.');
  expect(writes()).toHaveLength(1);
  expect(document.querySelector('[data-testid="admin-' + (view === 'questions' ? 'question' : 'topic') + '-notice"]')).toBeNull();
});

describe('catalog refresh wired through all six real manager mutation handlers', () => {
  it.each([
    ['questions', 'create'], ['questions', 'update'], ['questions', 'disable'],
    ['topics', 'create'], ['topics', 'update'], ['topics', 'disable'],
  ] as const)('%s %s refreshes learner/catalog projections after success', async (view, operation) => {
    const keys = [
      ['/api/topics'], ['/api/dashboard/summary'],
      ['/api/learning/progress', a],
      ['/api/practice/history', { offset: 0 }, a],
      ['/api/practice/topics/' + topicId + '/question', a],
    ];
    for (const key of keys) client.setQueryData(key, { before: true });
    const other = ['/api/learning/progress', b];
    client.setQueryData(other, { private: true });
    await render(view);
    const readsBefore = calls.filter(c => c.options.method === 'GET' && c.url.startsWith('/api/admin/')).length;
    if (operation === 'disable') {
      await button('Disable');
      await click(view === 'questions' ? '[data-testid="button-confirm-disable-question"]' : '[data-testid="button-confirm-disable"]');
    } else {
      if (operation === 'update') await button('Edit');
      if (view === 'questions') {
        await input('#question-topic', topicId); await input('#question-text', 'Catalog regression demo');
        if (operation === 'create') {
          for (const key of ['A', 'B', 'C', 'D']) await input('[aria-label="Option ' + key + ' text"]', 'Demo ' + key);
          await click('[aria-label="Mark option A as correct"]');
        }
      } else {
        await input('#topic-name', 'Catalog regression demo');
        await input('#topic-slug', 'catalog-demo');
      }
      await click('[data-testid="button-save-' + (view === 'questions' ? 'question' : 'topic') + '"]');
    }
    expect(writes()).toHaveLength(1);
    expect(writes()[0].options.method).toBe(operation === 'update' ? 'PATCH' : 'POST');
    expect(writes()[0].url).toBe('/api/admin/' + view +
      (operation === 'create' ? '' : '/' + (view === 'questions' ? question(a.userId).id : topicId)) +
      (operation === 'disable' ? '/disable' : ''));
    expect(new Headers(writes()[0].options.headers).get('X-Admin-Session')).toBe(a.sessionId);
    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(other)?.isInvalidated).toBe(false);
    expect(calls.filter(c => c.options.method === 'GET' && c.url.startsWith('/api/admin/')).length).toBeGreaterThan(readsBefore);
  });

  it.each(['questions', 'topics'] as const)('failed %s write retains draft and does not invalidate catalog', async view => {
    client.setQueryData(['/api/topics'], ['old catalog']);
    await render(view); await button('Edit');
    const pending = deferred<Response>(); nextWrite = pending;
    const field = view === 'questions' ? '#question-text' : '#topic-name';
    await input(field, 'Unsaved draft');
    await click('[data-testid="button-save-' + (view === 'questions' ? 'question' : 'topic') + '"]');
    await act(async () => pending.resolve(json({ error: { message: 'Write rejected' } }, 403)));
    expect(find<HTMLInputElement | HTMLTextAreaElement>(field).value).toBe('Unsaved draft');
    expect(container.textContent).toContain('server denied');
    expect(client.getQueryState(['/api/topics'])?.isInvalidated).toBe(false);
    expect(writes()).toHaveLength(1);
  });
});
