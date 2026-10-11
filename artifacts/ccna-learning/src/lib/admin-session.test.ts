import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { adminCreateQuestion, getAdminListQuestionsQueryOptions, getAdminListQuestionsQueryKey, getAdminListTopicsQueryKey } from '@workspace/api-client-react';
import {
  adminAuthState, adminQueryKey, adminQueryOptions, adminMutationOptions,
  removeOtherAdminData, removeAdminSessionData, createAdminLifetime, invalidateAdminQueries,
} from './admin-session';

const a = { userId: 'admin-a', sessionId: 'session-a' };
const b = { userId: 'admin-b', sessionId: 'session-b' };
const sameUser = { ...a, sessionId: 'another-session' };
const params = { limit: 20, offset: 0 };
let client: QueryClient;
const fetchMock = vi.fn();
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
beforeEach(() => { client = new QueryClient(); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { client.clear(); vi.unstubAllGlobals(); });

describe('admin session cache and lifetime', () => {
  it('distinguishes auth loading, signed out, incomplete and authenticated identity', () => {
    expect(adminAuthState({ isLoaded: false, isSignedIn: true, ...a })).toEqual({ status: 'loading' });
    expect(adminAuthState({ isLoaded: true, isSignedIn: false, ...a })).toEqual({ status: 'signed-out' });
    expect(adminAuthState({ isLoaded: true, isSignedIn: true, userId: a.userId })).toEqual({ status: 'loading' });
    expect(adminAuthState({ isLoaded: true, isSignedIn: true, ...a })).toEqual({ status: 'signed-in', identity: a });
  });

  it.each([b, sameUser])('isolates user/session keys while retaining filters: %j', identity => {
    const key = adminQueryKey(getAdminListQuestionsQueryKey(params), a);
    expect(key).not.toEqual(adminQueryKey(getAdminListQuestionsQueryKey(params), identity));
    expect(key).not.toEqual(adminQueryKey(getAdminListQuestionsQueryKey({ ...params, offset: 20 }), a));
    expect(key[1]).toEqual(params);
  });

  it('uses generated requests without sending cache identity to the API', async () => {
    fetchMock.mockResolvedValue(json({ items: [], total: 0, limit: 20, offset: 0 }));
    await client.fetchQuery(getAdminListQuestionsQueryOptions(params, adminQueryOptions(getAdminListQuestionsQueryKey(params), a)));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/questions?limit=20&offset=0', expect.objectContaining({
      method: 'GET', cache: 'no-store', credentials: 'same-origin', signal: expect.any(AbortSignal),
    }));
    expect(String(fetchMock.mock.calls[0][0])).not.toMatch(/admin-a|session-a/);
  });

  it('removes old and legacy admin queries while preserving new session and learner caches', () => {
    const old = adminQueryKey(getAdminListQuestionsQueryKey(params), a);
    const current = adminQueryKey(getAdminListTopicsQueryKey(), b);
    client.setQueryData(old, ['private A']);
    client.setQueryData(getAdminListTopicsQueryKey(), ['legacy']);
    client.setQueryData(current, ['current B']);
    client.setQueryData(['/api/topics'], ['public']);
    client.setQueryData(['/api/learning/progress', b], ['learner']);
    removeOtherAdminData(client, b);
    expect(client.getQueryData(old)).toBeUndefined();
    expect(client.getQueryData(getAdminListTopicsQueryKey())).toBeUndefined();
    expect(client.getQueryData(current)).toEqual(['current B']);
    expect(client.getQueryData(['/api/topics'])).toEqual(['public']);
    expect(client.getQueryData(['/api/learning/progress', b])).toEqual(['learner']);
  });

  it('sign-out removes all sensitive admin cache and retains unrelated data', () => {
    for (const identity of [a, b, sameUser]) client.setQueryData(adminQueryKey(getAdminListQuestionsQueryKey(), identity), ['private']);
    client.setQueryData(['/api/topics'], ['public']);
    removeOtherAdminData(client, null);
    expect(client.getQueryCache().getAll().map(q => q.queryKey)).toEqual([['/api/topics']]);
  });

  it('session cleanup does not remove another session of the same administrator', () => {
    const current = adminQueryKey(getAdminListTopicsQueryKey(), sameUser);
    client.setQueryData(current, ['current']);
    client.setQueryData(adminQueryKey(getAdminListTopicsQueryKey(), a), ['old']);
    removeAdminSessionData(client, a);
    expect(client.getQueryData(current)).toEqual(['current']);
  });

  it('a delayed query ignoring abort cannot restore removed cache after a switch', async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValue(pending.promise);
    const options = getAdminListQuestionsQueryOptions(params, adminQueryOptions(getAdminListQuestionsQueryKey(params), a));
    const request = client.fetchQuery(options).catch(() => undefined);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    removeOtherAdminData(client, b);
    expect(signal.aborted).toBe(true);
    pending.resolve(json({ items: ['private A'] }));
    await request;
    expect(client.getQueryData(options.queryKey)).toBeUndefined();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it('removes a pending mutation payload and does not restore it on late completion', async () => {
    const pending = deferred<unknown>();
    const observer = new MutationObserver(client, {
      ...adminMutationOptions('adminUpdateQuestion', a).mutation,
      mutationFn: () => pending.promise,
    });
    const unsubscribe = observer.subscribe(() => {});
    const request = observer.mutate({ text: 'private A' });
    await vi.waitFor(() => expect(client.getMutationCache().getAll()).toHaveLength(1));
    removeOtherAdminData(client, b);
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    pending.resolve({ explanation: 'private A response' });
    await request;
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    unsubscribe();
  });

  it('invalidates only the active administrator query family', async () => {
    const old = adminQueryKey(getAdminListQuestionsQueryKey(params), a);
    const current = adminQueryKey(getAdminListQuestionsQueryKey(params), b);
    client.setQueryData(old, []);
    client.setQueryData(current, []);
    await invalidateAdminQueries(client, getAdminListQuestionsQueryKey(), b);
    expect(client.getQueryState(old)?.isInvalidated).toBe(false);
    expect(client.getQueryState(current)?.isInvalidated).toBe(true);
  });

  it.each([b, sameUser])('rejects retained callbacks immediately when active identity changes: %j', identity => {
    const active = { current: a };
    const lifetime = createAdminLifetime(a, active);
    lifetime.activate();
    const callback = lifetime.scope.capture();
    expect(callback()).toBe(true);
    active.current = identity;
    expect(lifetime.scope.isCurrent()).toBe(false);
    expect(callback()).toBe(false);
  });

  it('rejects callbacks after teardown and after same-session reactivation', () => {
    const lifetime = createAdminLifetime(a, { current: a });
    lifetime.activate();
    const callback = lifetime.scope.capture();
    lifetime.deactivate();
    expect(callback()).toBe(false);
    expect(lifetime.scope.isCurrent()).toBe(false);
    lifetime.activate();
    expect(lifetime.scope.isCurrent()).toBe(true);
    expect(callback()).toBe(false);
    expect(lifetime.scope.capture()()).toBe(true);
  });
});

it('sends a captured session consistency signal through the real generated mutation transport', async () => {
  fetchMock.mockResolvedValue(json({ id: 'question' }));
  const options = adminMutationOptions('adminCreateQuestion', a);
  // Later identity state cannot change the already prepared precondition.
  await adminCreateQuestion({} as never, options.request);
  const [url, request] = fetchMock.mock.calls[0];
  const headers = new Headers(request.headers);
  expect(url).toBe('/api/admin/questions');
  expect(headers.get('X-Admin-Session')).toBe(a.sessionId);
  expect(headers.get('Authorization')).toBeNull();
  expect(headers.get('X-User-Id')).toBeNull();
  expect(request.credentials).toBe('same-origin');
  expect(request.cache).toBe('no-store');
});
