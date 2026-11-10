import pg from "pg";
import { pool } from "@workspace/db";
import { globalRoles, permits, roleChangeInput, RbacError, type GlobalRole, type Permission } from "./global-rbac-policy";
import { z } from "zod";

type Query = (text: string, values: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
const contextSchema = z.object({ role: z.enum(globalRoles).nullable(), scope: z.literal("GLOBAL") }).strict();
const pageSchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1) }).strict();
let managerPool: pg.Pool | undefined;
async function managementQuery(text: string, values: unknown[]) {
  if (!managerPool) {
    // Deliberately no fallback to the application pool or migrator credential.
    let url: URL;
    try { url = new URL(process.env.RBAC_MANAGEMENT_DATABASE_URL ?? ""); } catch {
      throw new RbacError(503, "RBAC_NOT_READY", "Dedicated RBAC management connection is not configured.");
    }
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' ||
      url.port !== '5432' || url.pathname !== '/ccna_phase6a_dev' || url.username !== 'ccna_rbac_manager' ||
      !url.password || url.search || url.hash) {
      throw new RbacError(503, "RBAC_NOT_READY", "RBAC management connection requires the reviewed local target and dedicated role.");
    }
    managerPool = new pg.Pool({ host: url.hostname, port: 5432, database: 'ccna_phase6a_dev',
      user: 'ccna_rbac_manager', password: decodeURIComponent(url.password), ssl: false,
      max: 1, connectionTimeoutMillis: 5000, statement_timeout: 10000, application_name: 'ccna-global-rbac-manager' });
    managerPool.on('error', () => {}); // Never print driver diagnostics/connection configuration.
  }
  return managerPool.query(text, values);
}
export function createGlobalRbacService(read: Query, change: Query, enabled: () => boolean) {
  function ready() {
    if (!enabled()) throw new RbacError(503, "RBAC_NOT_READY", "GLOBAL role management is not activated.");
  }
  async function context(actor: string) {
    ready();
    const result = await read('SELECT public.global_rbac_context($1::uuid) AS value', [actor]);
    const parsed = contextSchema.safeParse(result.rows[0]?.value);
    if (!parsed.success) throw new RbacError(503, "RBAC_NOT_READY", "Role context could not be verified.");
    return parsed.data;
  }
  async function authorize(actor: string, permission: Permission): Promise<GlobalRole> {
    const current = await context(actor);
    if (!permits(current.role, permission)) throw new RbacError(403, "RBAC_FORBIDDEN", "An explicit GLOBAL assignment is required.");
    return current.role!;
  }
  return {
    context,
    async me(actor: string) {
      const current = await context(actor);
      return { ...current, actorId: actor, canReadUsers: permits(current.role, 'users.read'), canManageRoles: permits(current.role, 'roles.manage'),
        canReadAudit: permits(current.role, 'audit.read'), courseEnabled: false };
    },
    async list(actor: string, section: 'users' | 'audit', input: unknown) {
      await authorize(actor, section === 'users' ? 'users.read' : 'audit.read');
      const page = pageSchema.safeParse(input);
      if (!page.success) throw new RbacError(400, 'RBAC_VALIDATION', 'Use a bounded page number; COURSE scope is unavailable.');
      const result = await read('SELECT public.global_rbac_read($1::uuid,$2::text,$3::integer) AS value', [actor, section, page.data.page]);
      return result.rows[0]?.value;
    },
    async change(actor: string, input: unknown) {
      await authorize(actor, 'roles.manage');
      const parsed = roleChangeInput.safeParse(input);
      if (!parsed.success) throw new RbacError(400, 'RBAC_VALIDATION', 'Use GLOBAL scope and valid role-change fields.');
      if (actor === parsed.data.targetId) throw new RbacError(403, 'RBAC_SELF_CHANGE', 'Self role changes are not allowed.');
      const p = parsed.data;
      // SQL re-authorizes actor/target under the authority lock, checks version,
      // delegation ceiling/last Owner and atomically appends the audit event.
      const result = await change('SELECT public.global_rbac_change($1::uuid,$2::uuid,$3::text,$4::integer,$5::uuid,$6::text) AS value',
        [actor, p.targetId, p.role, p.expectedVersion, p.requestId, p.reason]);
      return result.rows[0]?.value;
    },
  };
}
export const globalRbac = createGlobalRbacService((text, values) => pool.query(text, values), managementQuery,
  () => process.env.RBAC_ENABLED === 'true');

// Fixed-operation adapter reuses the reviewed dedicated manager transport.
// It does not export arbitrary SQL or fall back to app/migrator credentials.
export function catalogDraftManagement(values: unknown[]) {
  return managementQuery('SELECT public.catalog_draft_change($1::uuid,$2::text,$3::uuid,$4::text,$5::uuid,$6::jsonb) AS value', values);
}
