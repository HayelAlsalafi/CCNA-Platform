import { z } from "zod/v4";

export const accessActions = ["metadata.read", "lesson.read", "media.read", "practice.start", "exam.start"] as const;
export type AccessAction = typeof accessActions[number];
export const accessResource = z.strictObject({ kind: z.enum(["COURSE", "VERSION", "LESSON"]), id: z.string().uuid() });
export type AccessResource = z.infer<typeof accessResource>;
const actions = z.array(z.enum(accessActions)).max(5);
const contextSchema = z.object({
  actorActive: z.boolean(),
  resource: accessResource.extend({
    available: z.boolean(), policy: z.enum(["FREE_OPEN", "FREE_PREVIEW", "ENTITLED"]),
    freeActions: actions, previewActions: actions,
    publishedRevisionId: z.string().uuid().nullable(), previewRevisionId: z.string().uuid().nullable(),
  }),
  grants: z.array(z.object({
    userId: z.string().uuid(), resourceId: z.string().uuid(), actions,
    startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }).nullable(),
    revokedAt: z.string().datetime({ offset: true }).nullable(),
  })).max(1000),
});
export type AccessContext = z.infer<typeof contextSchema>;
export type AccessActor = { id: string; status: string; role?: string };

/** Direct resource grants only: neither free ancestors nor staff roles imply access. */
export function evaluateAccess(actor: AccessActor | null, resource: AccessResource, action: AccessAction, raw: unknown, now: Date, disclosedRevision?: string): boolean {
  if (!actor || actor.status !== "ACTIVE" || !z.string().uuid().safeParse(actor.id).success || !Number.isFinite(now.getTime())) return false;
  if (!accessResource.safeParse(resource).success || !accessActions.includes(action)) return false;
  const parsed = contextSchema.safeParse(raw);
  if (!parsed.success) return false;
  const { resource: current, grants, actorActive } = parsed.data;
  if (!actorActive || !current.available || current.kind !== resource.kind || current.id !== resource.id) return false;
  if (resource.kind === "LESSON" && !["metadata.read", "lesson.read", "media.read"].includes(action)) return false;
  if (resource.kind !== "LESSON" && ["lesson.read", "media.read"].includes(action)) return false;
  if (current.policy === "FREE_OPEN" && current.freeActions.includes(action)) return true;
  if (current.policy === "FREE_PREVIEW" && current.previewActions.includes(action)) {
    // Preview means an explicitly approved WHOLE published lesson revision, never
    // a full-body response subsequently hidden by the browser.
    if (action === "metadata.read") return true;
    if (resource.kind === "LESSON" && ["lesson.read", "media.read"].includes(action) &&
        current.previewRevisionId !== null && current.previewRevisionId === current.publishedRevisionId &&
        (disclosedRevision === undefined || disclosedRevision === current.previewRevisionId)) return true;
  }
  return grants.some(g => g.userId === actor.id && g.resourceId === resource.id && g.revokedAt === null && g.actions.includes(action) &&
    Date.parse(g.startsAt) <= now.getTime() && (g.endsAt === null || now.getTime() < Date.parse(g.endsAt)) &&
    (g.endsAt === null || Date.parse(g.endsAt) > Date.parse(g.startsAt)));
}
