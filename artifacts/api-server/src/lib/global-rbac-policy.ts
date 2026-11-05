import { z } from "zod";

export const globalRoles = ["OWNER", "ADMIN", "CONTENT_MANAGER", "STUDENT"] as const;
export type GlobalRole = typeof globalRoles[number];
export const permissions = {
  OWNER: ["users.read", "roles.manage", "audit.read", "content.read", "content.edit", "content.publish"],
  ADMIN: ["users.read", "roles.manage", "audit.read", "content.read", "content.edit", "content.publish"],
  CONTENT_MANAGER: ["content.read", "content.edit", "content.publish"],
  STUDENT: ["content.read"],
} as const;
export type Permission = typeof permissions[GlobalRole][number];
export function permits(role: unknown, permission: Permission, scope: string = "GLOBAL"): boolean {
  if (scope !== "GLOBAL" || !globalRoles.includes(role as GlobalRole)) return false;
  return (permissions[role as GlobalRole] as readonly string[]).includes(permission);
}
export function mayAssign(actor: GlobalRole, existing: GlobalRole | null, next: GlobalRole | null) {
  return actor === "OWNER" || (actor === "ADMIN" &&
    ![existing, next].some(role => role === "OWNER" || role === "ADMIN"));
}
export const roleChangeInput = z.object({
  scope: z.literal("GLOBAL"),
  targetId: z.string().uuid(),
  role: z.enum(globalRoles).nullable(),
  expectedVersion: z.number().int().min(0).max(2147483646),
  requestId: z.string().uuid(),
  reason: z.string().trim().min(5).max(500),
}).strict();
export type RoleChange = z.infer<typeof roleChangeInput>;
export class RbacError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function validateRoleChange(actorId: string, actorRole: GlobalRole, current: GlobalRole | null, input: unknown) {
  const parsed = roleChangeInput.safeParse(input);
  if (!parsed.success) throw new RbacError(400, "RBAC_VALIDATION", "Use GLOBAL scope and valid role-change fields.");
  if (parsed.data.targetId === actorId) throw new RbacError(403, "RBAC_SELF_CHANGE", "Self role changes are not allowed.");
  if (!mayAssign(actorRole, current, parsed.data.role)) throw new RbacError(403, "RBAC_FORBIDDEN", "This role change exceeds your authority.");
  return parsed.data;
}
