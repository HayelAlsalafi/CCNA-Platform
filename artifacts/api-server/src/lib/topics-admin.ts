import { ccnaBookChapters } from "../../../../lib/ccna-book-chapters";
import { asc, eq } from "drizzle-orm";
import { db as defaultDb, topicsTable, type Topic } from "@workspace/db";
import { createTopicInputSchema, updateTopicInputSchema } from "@workspace/db/schema";

type Db = typeof defaultDb;

export class TopicError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409,
    public readonly code: "VALIDATION_ERROR" | "NOT_FOUND" | "CONFLICT",
    message: string,
    public readonly details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

export function toAdminTopic(t: Topic) {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    description: t.description,
    displayOrder: t.displayOrder,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

function parse<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } } }, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new TopicError(
      400,
      "VALIDATION_ERROR",
      "Invalid topic data.",
      r.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
    );
  }
  return r.data;
}

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

async function ensureSlugFree(db: Db, slug: string, exceptId?: string) {
  const [row] = await db.select({ id: topicsTable.id }).from(topicsTable).where(eq(topicsTable.slug, slug)).limit(1);
  if (row && row.id !== exceptId) throw new TopicError(409, "CONFLICT", "A topic with this slug already exists.");
}

export async function listAllTopics(db: Db = defaultDb) {
  return db.select().from(topicsTable).orderBy(asc(topicsTable.displayOrder), asc(topicsTable.name));
}

export async function createTopic(_input: unknown, _db: Db = defaultDb): Promise<Topic> {
  throw new TopicError(409,"CONFLICT","Use Chapters & domains to initialize a missing canonical chapter. Arbitrary topic creation is retired.");
}

export async function updateTopic(id: string, input: unknown, db: Db = defaultDb) {
  const data = parse(updateTopicInputSchema, input);
  assertCanonicalTopicEdit(id,data);
  if (data.slug) await ensureSlugFree(db, data.slug, id);
  try {
    const [row] = await db
      .update(topicsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(topicsTable.id, id))
      .returning();
    if (!row) throw new TopicError(404, "NOT_FOUND", "Topic not found.");
    return row;
  } catch (e) {
    if (isUniqueViolation(e)) throw new TopicError(409, "CONFLICT", "A topic with this slug already exists.");
    throw e;
  }
}

export async function disableTopic(id: string, db: Db = defaultDb) {
  const [row] = await db
    .update(topicsTable)
    .set({ status: "DISABLED", updatedAt: new Date() })
    .where(eq(topicsTable.id, id))
    .returning();
  if (!row) throw new TopicError(404, "NOT_FOUND", "Topic not found.");
  return row;
}

export function assertCanonicalTopicEdit(id:string,data:{name?:string;slug?:string}) {
 const c=ccnaBookChapters.find(c=>c.topicId===id);
 if(!c || (data.name!==undefined&&data.name!==c.title)||(data.slug!==undefined&&data.slug!==c.slug))
   throw new TopicError(409,"CONFLICT","Canonical chapter title, slug and stable identity cannot be changed. Edit description, order or availability instead.");
}
