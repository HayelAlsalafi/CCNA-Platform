// @vitest-environment jsdom
import { act, StrictMode, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { customFetch, setAuthTokenGetter } from '../../../../lib/api-client-react/src/custom-fetch';
import { ClerkRequestAuth } from './clerk-request-auth';
const mock = vi.hoisted(() => ({ loaded: true, clerk: { loaded: true, session: null as any, addListener: vi.fn() } }));
vi.mock('@clerk/react', () => ({ useClerk: () => mock.clerk, useAuth: () => ({ isLoaded: mock.loaded }) }));
let root: Root, container: HTMLDivElement;
let listeners: Set<(state: { session: any }) => void>;
const fetchMock = vi.fn(), rejected = vi.fn();
const session = (id: string) => ({ id, user: { id: 'user-' + id }, getToken: vi.fn().mockResolvedValue('unit-token-' + id) });
function Child() { useEffect(() => { void customFetch('/api/auth/me').catch(rejected); }, []); return <div data-testid="child" />; }
async function render(strict = false) { await act(async () => { const content = <ClerkRequestAuth><Child /></ClerkRequestAuth>; root.render(strict ? <StrictMode>{content}</StrictMode> : content); }); }
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; mock.loaded = true; mock.clerk.loaded = true; mock.clerk.session = session('a'); listeners = new Set(); mock.clerk.addListener.mockReset().mockImplementation(callback => { listeners.add(callback); callback({ session: mock.clerk.session }); return () => listeners.delete(callback); }); fetchMock.mockReset().mockImplementation(() => new Response('{}', { headers: { 'Content-Type': 'application/json' } })); rejected.mockReset(); vi.stubGlobal('fetch', fetchMock); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); setAuthTokenGetter(null); vi.unstubAllGlobals(); });
it('installs request binding before descendant requests, including StrictMode remount', async () => {
 await render(true); expect(fetchMock).toHaveBeenCalled();
 for (const [, request] of fetchMock.mock.calls) { expect(request.credentials).toBe('omit'); expect(new Headers(request.headers).get('Authorization')).toBe('Bearer unit-token-a'); }
 expect(listeners.size).toBe(1);
});
it('does not mount query children until Clerk authentication has loaded', async () => {
 mock.loaded = false; mock.clerk.loaded = false; await render(); expect(fetchMock).not.toHaveBeenCalled(); expect(container.querySelector('[data-testid="child"]')).toBeNull();
 mock.loaded = true; mock.clerk.loaded = true; await render(); expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('uses mocked SDK identity notifications to reject A/B/A token completion before network dispatch', async () => {
 let resolve!: (token: string) => void; const a = mock.clerk.session; a.getToken.mockReturnValue(new Promise<string>(r => { resolve = r; })); await render();
 await act(async () => { mock.clerk.session = session('b'); for (const listener of listeners) listener({ session: mock.clerk.session }); mock.clerk.session = a; for (const listener of listeners) listener({ session: a }); resolve('unit-stale-token'); });
 expect(fetchMock).not.toHaveBeenCalled(); expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ message: 'The authentication session changed before request dispatch.' }));
});
it('cleans SDK listeners and request configuration on unmount', async () => {
 await render(); await act(async () => root.unmount()); expect(listeners.size).toBe(0); fetchMock.mockClear(); await customFetch('/api/topics', { credentials: 'same-origin' }); expect(fetchMock.mock.calls[0][1].credentials).toBe('same-origin'); expect(new Headers(fetchMock.mock.calls[0][1].headers).has('Authorization')).toBe(false); root = createRoot(container);
});
