import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { customFetch, setAuthTokenGetter } from '../../../../lib/api-client-react/src/custom-fetch';
import { createSessionTokenGetter, type RequestAuthState } from './clerk-request-auth';
const response = () => new Response('{}', { headers: { 'Content-Type': 'application/json' } });
const fetchMock = vi.fn();
const session = (id: string, user = 'user-a') => ({ id, user: { id: user }, getToken: vi.fn().mockResolvedValue('unit-test-token-' + id) });
let state: RequestAuthState;
function deferred() { let resolve!: (value: string | null) => void; const promise = new Promise<string | null>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => { state = { loaded: true, session: session('session-a'), generation: 0 }; fetchMock.mockReset().mockImplementation(response); vi.stubGlobal('fetch', fetchMock); setAuthTokenGetter(createSessionTokenGetter(() => state), { credentials: 'omit' }); });
afterEach(() => { setAuthTokenGetter(null); vi.unstubAllGlobals(); });
it.each(['/api/auth/me', '/api/admin/questions', '/api/practice/history', '/api/practice/topics/topic/question'])('binds %s to the active Clerk token without the shared cookie', async path => {
  state.session = session('session-b', 'user-b'); state.generation++;
  await customFetch(path, { credentials: 'same-origin' });
  const request = fetchMock.mock.calls[0][1];
  expect(new Headers(request.headers).get('Authorization')).toBe('Bearer unit-test-token-session-b');
  expect(request.credentials).toBe('omit');
});
it('preserves a captured admin consistency precondition alongside verified bearer transport', async () => {
  await customFetch('/api/admin/questions/question', { method: 'PATCH', body: '{}', headers: { 'X-Admin-Session': 'session-a' } });
  const headers = new Headers(fetchMock.mock.calls[0][1].headers);
  expect(headers.get('Authorization')).toBe('Bearer unit-test-token-session-a');
  expect(headers.get('X-Admin-Session')).toBe('session-a');
});
it('sends signed-out public requests anonymously even if the browser still has an old cookie', async () => {
  state.session = null; state.generation++;
  await customFetch('/api/topics');
  expect(fetchMock.mock.calls[0][1].credentials).toBe('omit');
  expect(new Headers(fetchMock.mock.calls[0][1].headers).has('Authorization')).toBe(false);
});
it('does not dispatch while authentication is loading', async () => {
  state.loaded = false;
  await expect(customFetch('/api/auth/me')).rejects.toThrow('still loading');
  expect(fetchMock).not.toHaveBeenCalled();
});
it.each(['another-user', 'same-user-session', 'sign-out', 'A-B-A'])('rejects delayed token completion across %s before fetch', async transition => {
  const pending = deferred(); const a = state.session!; a.getToken = () => pending.promise;
  const request = customFetch('/api/practice/questions/question/answer', { method: 'POST', body: '{}' });
  if (transition === 'another-user') state.session = session('session-b', 'user-b');
  if (transition === 'same-user-session') state.session = session('another-a');
  if (transition === 'sign-out') state.session = null;
  state.generation += transition === 'A-B-A' ? 2 : 1;
  pending.resolve('unit-test-original-token');
  await expect(request).rejects.toThrow('changed before request dispatch');
  expect(fetchMock).not.toHaveBeenCalled();
});
it('never falls back to cookies if Clerk cannot supply a token', async () => {
  state.session!.getToken = vi.fn().mockResolvedValue(null);
  await expect(customFetch('/api/auth/me')).rejects.toThrow('no authentication token');
  expect(fetchMock).not.toHaveBeenCalled();
});
it('preserves transport credentials captured before getter configuration changes', async () => {
  const pending = deferred(); state.session!.getToken = () => pending.promise;
  const request = customFetch('/api/auth/me');
  setAuthTokenGetter(null); pending.resolve('unit-test-original-token'); await request;
  expect(fetchMock.mock.calls[0][1].credentials).toBe('omit');
});
it('keeps cookie behavior unchanged for clients that do not configure token authentication', async () => {
  setAuthTokenGetter(null); await customFetch('/api/auth/me', { credentials: 'same-origin' });
  expect(fetchMock.mock.calls[0][1].credentials).toBe('same-origin');
  expect(new Headers(fetchMock.mock.calls[0][1].headers).has('Authorization')).toBe(false);
});
