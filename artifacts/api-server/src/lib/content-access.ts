import { sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";
import { accessResource, evaluateAccess, type AccessActor, type AccessAction, type AccessResource } from "./content-access-policy";

export const contentAccessRequested = () => process.env.CONTENT_ACCESS_ENABLED === "true";
type Read = (query: SQL) => Promise<{ rows: Record<string, unknown>[] }>;
export function createContentAccess(read: Read, enabled: () => boolean, clock: () => Date = () => new Date()) {
  return async function canAccess(actor: AccessActor | null, resource: AccessResource, action: AccessAction, disclosedRevision?: string): Promise<boolean> {
    if (!actor || actor.status !== "ACTIVE") return false;
    // Compatibility is a no-op only inside already authenticated legacy paths;
    // existing publication, ownership, RLS and admin checks still apply.
    if (!enabled()) return true;
    if (!accessResource.safeParse(resource).success) return false;
    try {
      const result = await read(sql`SELECT public.content_access_context(${actor.id}::uuid,${resource.kind},${resource.id}::uuid) AS value`);
      return evaluateAccess(actor, resource, action, result.rows[0]?.value, clock(), disclosedRevision);
    } catch { return false; } // Missing schema/permission/malformed context never falls back to legacy.
  };
}
export const canAccess = createContentAccess(query => db.execute(query), contentAccessRequested);
