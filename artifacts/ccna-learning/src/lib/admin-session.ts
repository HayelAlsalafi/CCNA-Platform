import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { progressIdentity, type ProgressIdentity } from './learning-progress-cache';

export type AdminIdentity = ProgressIdentity;
export type AdminAuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; identity: AdminIdentity };

export function adminAuthState(auth: Parameters<typeof progressIdentity>[0]): AdminAuthState {
  if (!auth.isLoaded) return { status: 'loading' };
  if (!auth.isSignedIn) return { status: 'signed-out' };
  const identity = progressIdentity(auth);
  return identity ? { status: 'signed-in', identity } : { status: 'loading' };
}

export function adminSessionKey(identity: AdminIdentity) {
  return JSON.stringify([identity.userId, identity.sessionId]);
}

export function adminQueryKey(base: QueryKey, identity: AdminIdentity) {
  return [...base, { adminSession: adminSessionKey(identity) }] as const;
}

function owner(key: QueryKey | undefined): string | undefined {
  const last = key?.at(-1);
  return last && typeof last === 'object' && 'adminSession' in last
    ? (last as { adminSession: string }).adminSession : undefined;
}

const queryFamilies = new Set(['/api/admin/questions', '/api/admin/topics']);
const legacyMutationNames = new Set([
  'adminCreateQuestion', 'adminUpdateQuestion', 'adminDisableQuestion',
  'adminCreateTopic', 'adminUpdateTopic', 'adminDisableTopic',
]);
const isAdminQuery = (key: QueryKey) => queryFamilies.has(String(key[0]));
const isAdminMutation = (key: QueryKey | undefined) =>
  key?.[0] === 'admin-session' || legacyMutationNames.has(String(key?.[0]));

export function adminQueryOptions(base: QueryKey, identity: AdminIdentity) {
  return {
    query: {
      queryKey: adminQueryKey(base, identity),
      gcTime: 0,
      retry: false as const,
      placeholderData: () => undefined,
    },
    request: { credentials: 'same-origin' as const, cache: 'no-store' as const },
  };
}

export function adminMutationOptions(operation: string, identity: AdminIdentity) {
  return {
    mutation: {
      mutationKey: ['admin-session', operation, { adminSession: adminSessionKey(identity) }],
      gcTime: 0,
    },
    request: {
      credentials: 'same-origin' as const,
      cache: 'no-store' as const,
      // A precondition, never authorization evidence. The server compares this
      // with Clerk's verified session while still checking the database role.
      headers: { 'X-Admin-Session': identity.sessionId },
    },
  };
}

function removeAdminData(client: QueryClient, matches: (session: string | undefined) => boolean) {
  const filter = { predicate: (query: { queryKey: QueryKey }) =>
    isAdminQuery(query.queryKey) && matches(owner(query.queryKey)) };
  // Generated query functions consume the AbortSignal. Destruction also stops
  // a transport that ignores abort from restoring a removed session's cache.
  void client.cancelQueries(filter);
  client.removeQueries(filter);
  for (const mutation of client.getMutationCache().getAll()) {
    if (isAdminMutation(mutation.options.mutationKey) && matches(owner(mutation.options.mutationKey))) {
      // Removing cache state does not undo an already accepted server write.
      client.getMutationCache().remove(mutation);
    }
  }
}

export function removeOtherAdminData(client: QueryClient, identity: AdminIdentity | null) {
  const current = identity ? adminSessionKey(identity) : undefined;
  removeAdminData(client, session => !current || session !== current);
}

export function removeAdminSessionData(client: QueryClient, identity: AdminIdentity) {
  const current = adminSessionKey(identity);
  removeAdminData(client, session => !session || session === current);
}

export function invalidateAdminQueries(client: QueryClient, base: QueryKey, identity: AdminIdentity) {
  const current = adminSessionKey(identity);
  return client.invalidateQueries({
    predicate: query => query.queryKey[0] === base[0] && owner(query.queryKey) === current,
  });
}

export type AdminSessionScope = {
  identity: AdminIdentity;
  isCurrent: () => boolean;
  capture: () => () => boolean;
};

export function createAdminLifetime(
  identity: AdminIdentity,
  active: { current: AdminIdentity },
) {
  let generation: object | null = null;
  const sameIdentity = () => adminSessionKey(identity) === adminSessionKey(active.current);
  const scope: AdminSessionScope = {
    identity,
    isCurrent: () => generation !== null && sameIdentity(),
    capture: () => {
      const captured = generation;
      return () => captured !== null && generation === captured && sameIdentity();
    },
  };
  return {
    scope,
    activate: () => { generation = {}; },
    deactivate: () => { generation = null; },
  };
}
