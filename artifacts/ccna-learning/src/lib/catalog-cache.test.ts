import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshCatalog } from './catalog-cache';
import { adminQueryKey } from './admin-session';
import { sessionQueryKey } from './learning-progress-cache';

const a = { userId: 'admin-a', sessionId: 'session-a' };
const b = { userId: 'admin-b', sessionId: 'session-b' };
const sameUser = { ...a, sessionId: 'session-a2' };
const affectedKeys = [
  adminQueryKey(['/api/admin/questions', { offset: 0 }], a),
  adminQueryKey(['/api/admin/questions', { offset: 20, status: 'DISABLED' }], a),
  adminQueryKey(['/api/admin/topics'], a),
  ['/api/topics'],
  ['/api/dashboard/summary'],
  sessionQueryKey(['/api/learning/progress'], a),
  sessionQueryKey(['/api/practice/history', { limit: 20, offset: 0 }], a),
  sessionQueryKey(['/api/practice/history', { limit: 20, offset: 20 }], a),
  sessionQueryKey(['/api/practice/topics/topic-a/question'], a),
  sessionQueryKey(['/api/questions/question-a'], a),
];
const clients: QueryClient[] = [];
function client() {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(c); return c;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
afterEach(() => { clients.forEach(c => c.clear()); clients.length = 0; });

describe('successful catalog mutations', () => {
  it('marks every catalog projection and pagination variant stale without rewriting answers', async () => {
    const c = client();
    const old = { attempts: [{ correct: true }], catalog: 'before' };
    affectedKeys.forEach(key => c.setQueryData(key, old));
    await refreshCatalog(c, a, () => true);
    for (const key of affectedKeys) {
      expect(c.getQueryState(key)?.isInvalidated).toBe(true);
      expect(c.getQueryData(key)).toEqual(old);
    }
  });

  it.each([b, sameUser])('does not refresh another user/session private data: %j', async identity => {
    const c = client();
    const keys = [
      adminQueryKey(['/api/admin/questions'], identity),
      adminQueryKey(['/api/admin/topics'], identity),
      sessionQueryKey(['/api/learning/progress'], identity),
      sessionQueryKey(['/api/practice/history', { offset: 0 }], identity),
      sessionQueryKey(['/api/practice/topics/topic-a/question'], identity),
      sessionQueryKey(['/api/questions/question-a'], identity),
      sessionQueryKey(['/api/auth/me'], a),
      sessionQueryKey(['/api/admin/access'], a),
      ['/api/admin/questions'], // Legacy private cache has no verified owner.
    ];
    keys.forEach(key => c.setQueryData(key, 'private'));
    await refreshCatalog(c, a, () => true);
    keys.forEach(key => expect(c.getQueryState(key)?.isInvalidated).toBe(false));
  });

  it('refetches an active learner query and leaves inactive queries stale until mounted', async () => {
    const c = client(), activeKey = affectedKeys[5], inactiveKey = affectedKeys[6];
    c.setQueryData(activeKey, { label: 'old' }); c.setQueryData(inactiveKey, { label: 'old' });
    const read = vi.fn(async () => ({ label: 'updated' }));
    const observer = new QueryObserver(c, { queryKey: activeKey, queryFn: read, staleTime: Infinity });
    const unsubscribe = observer.subscribe(() => {});
    try {
      await refreshCatalog(c, a, () => true);
      expect(read).toHaveBeenCalledTimes(1);
      expect(c.getQueryData(activeKey)).toEqual({ label: 'updated' });
      expect(c.getQueryState(inactiveKey)?.isInvalidated).toBe(true);
      expect(c.getQueryData(inactiveKey)).toEqual({ label: 'old' });
    } finally { unsubscribe(); }
  });

  it.each([true, false])('cancels pre-write delayed reads even if transport ignores abort (active=%s)', async active => {
    const c = client(), key = affectedKeys[8], pending = deferred<string>();
    let signal: AbortSignal | undefined;
    const read = vi.fn(({ signal: next }: { signal: AbortSignal }) => {
      signal ??= next;
      return read.mock.calls.length === 1 ? pending.promise : Promise.resolve('updated');
    });
    const observer = new QueryObserver(c, { queryKey: key, queryFn: read });
    const unsubscribe = active ? observer.subscribe(() => {}) : () => {};
    const oldFetch = active ? null : c.fetchQuery({ queryKey: key, queryFn: read }).catch(() => 'cancelled');
    await refreshCatalog(c, a, () => true);
    expect(signal?.aborted).toBe(true);
    pending.resolve('stale pre-write content');
    await oldFetch; await Promise.resolve();
    expect(c.getQueryData(key)).toBe(active ? 'updated' : undefined);
    expect(c.getQueryState(key)?.isInvalidated).toBe(!active);
    unsubscribe();
  });

  it('ignores a completed mutation belonging to a departed editor lifetime', async () => {
    const c = client(); c.setQueryData(affectedKeys[3], 'catalog');
    const cancel = vi.spyOn(c, 'cancelQueries');
    await refreshCatalog(c, a, () => false);
    expect(cancel).not.toHaveBeenCalled();
    expect(c.getQueryState(affectedKeys[3])?.isInvalidated).toBe(false);
  });

  it('does not refetch after the session changes while cancellation settles', async () => {
    const c = client(); c.setQueryData(affectedKeys[3], 'catalog');
    let current = true;
    const cancel = c.cancelQueries.bind(c);
    vi.spyOn(c, 'cancelQueries').mockImplementation(async filters => {
      await cancel(filters); current = false;
    });
    await refreshCatalog(c, a, () => current);
    expect(c.getQueryState(affectedKeys[3])?.isInvalidated).toBe(false);
  });
});
