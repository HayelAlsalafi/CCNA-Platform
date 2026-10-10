import type { QueryClient, QueryKey } from '@tanstack/react-query';
import {
  getAdminListQuestionsQueryKey, getAdminListTopicsQueryKey,
  getGetDashboardSummaryQueryKey, getGetLearningProgressQueryKey,
  getListTopicsQueryKey,
} from '@workspace/api-client-react';
import { adminSessionKey, type AdminIdentity } from './admin-session';

const adminFamilies = new Set<string>([
  getAdminListQuestionsQueryKey()[0], getAdminListTopicsQueryKey()[0],
]);
const sharedFamilies = new Set<string>([
  getListTopicsQueryKey()[0], getGetDashboardSummaryQueryKey()[0],
]);

function belongsTo(key: QueryKey, identity: AdminIdentity) {
  const owner = key.at(-1);
  return !!owner && typeof owner === 'object' &&
    'userId' in owner && 'sessionId' in owner &&
    owner.userId === identity.userId && owner.sessionId === identity.sessionId;
}

function affected(key: QueryKey, identity: AdminIdentity) {
  const family = String(key[0]);
  if (adminFamilies.has(family)) {
    const owner = key.at(-1);
    return !!owner && typeof owner === 'object' && 'adminSession' in owner &&
      owner.adminSession === adminSessionKey(identity);
  }
  if (sharedFamilies.has(family)) return true;
  const learnerCatalog = family === getGetLearningProgressQueryKey()[0] ||
    family === '/api/practice/history' ||
    /^\/api\/practice\/topics\/[^/]+\/question$/.test(family) ||
    /^\/api\/questions\/[^/]+$/.test(family);
  return learnerCatalog && belongsTo(key, identity);
}

/** Call only after a successful server mutation, with its captured editor lifetime.
 * Cancel older reads first: an inactive pending request must not restore stale data.
 * Invalidate rather than copying ADMIN responses into learner caches.
 */
export async function refreshCatalog(
  client: QueryClient,
  identity: AdminIdentity,
  isCurrent: () => boolean,
) {
  if (!isCurrent()) return;
  const filters = { predicate: (query: { queryKey: QueryKey }) => affected(query.queryKey, identity) };
  await client.cancelQueries(filters);
  if (!isCurrent()) return;
  await client.invalidateQueries(filters);
}
