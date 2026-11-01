import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db as defaultDb, questionsTable, topicsTable } from "@workspace/db";

export const deleteIdsSchema = z
  .object({
    ids: z
      .array(z.string().uuid())
      .min(1)
      .max(500)
      .refine(
        (ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length,
        "Duplicate identifiers are not permitted.",
      ),
  })
  .strict();
export type DeleteOutcome = {
  id: string;
  outcome: "DELETED" | "BLOCKED";
  reason: string;
  dependencies?: Record<string, number>;
  constraint?: string;
};
export class AdminDeleteError extends Error {
  readonly status = 400;
}
const code = (error: unknown): string | undefined => {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
};

/** One transaction, ordered parent locks, per-item savepoints. No history DELETE.
 * FK races fail closed. A topic never implicitly deletes its questions. */
export async function deleteAdminRecords(
  kind: "questions" | "topics",
  input: unknown,
  db = defaultDb,
) {
  const parsed = deleteIdsSchema.safeParse(input);
  if (!parsed.success) throw new AdminDeleteError("Select 1–500 unique valid record identifiers.");
  const ids = parsed.data.ids.map((id) => id.toLowerCase()).sort();
  const items = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await tx.execute(sql`SET LOCAL statement_timeout = '30s'`);
    const table = kind === "questions" ? questionsTable : topicsTable;
    await tx.execute(
      sql`SELECT id FROM ${table} WHERE ${inArray(table.id, ids)} ORDER BY id FOR UPDATE`,
    );
    const outcomes: DeleteOutcome[] = [];
    for (const id of ids) {
      try {
        const outcome = await tx.transaction(async (itemTx) => {
          const rows = await itemTx
            .select({ id: table.id })
            .from(table)
            .where(eq(table.id, id))
            .limit(1);
          if (!rows.length) return { id, outcome: "BLOCKED" as const, reason: "Record not found." };
          const evidence =
            kind === "questions"
              ? await itemTx.execute<Record<string, number>>(sql`SELECT
                (SELECT count(*)::int FROM public.question_revisions WHERE question_id=${id}::uuid) AS revisions,
                (SELECT count(*)::int FROM public.practice_deliveries WHERE question_id=${id}::uuid) AS deliveries,
                (SELECT count(*)::int FROM public.practice_attempts WHERE question_id=${id}::uuid) AS attempts`)
              : await itemTx.execute<Record<string, number>>(sql`SELECT
                (SELECT count(*)::int FROM public.questions WHERE topic_id=${id}::uuid AND status='ACTIVE') AS active_questions,
                (SELECT count(*)::int FROM public.questions WHERE topic_id=${id}::uuid AND status<>'ACTIVE') AS other_questions,
                (SELECT count(*)::int FROM public.practice_attempts WHERE topic_id=${id}::uuid) AS attempts,
                (SELECT count(*)::int FROM public.question_revisions WHERE (snapshot->'topic'->>'id')::uuid=${id}::uuid) AS revision_snapshots`);
          const dependencies = evidence.rows[0];
          const keys =
            kind === "questions"
              ? ["revisions", "deliveries", "attempts"]
              : ["active_questions", "other_questions", "attempts", "revision_snapshots"];
          if (
            !dependencies ||
            keys.some((key) => !Number.isSafeInteger(dependencies[key]) || dependencies[key]! < 0)
          )
            throw Error("Deletion dependency evidence is invalid.");
          const blockers = keys.filter((key) => dependencies[key]! > 0);
          if (blockers.length)
            return {
              id,
              outcome: "BLOCKED" as const,
              dependencies,
              reason:
                "Permanent deletion blocked by " +
                blockers.map((key) => `${key}: ${dependencies[key]}`).join(", ") +
                ". Records and status are unchanged.",
            };
          if (kind === "questions") {
            // Only mutable taxonomy links are removed; options use their existing CASCADE.
            await itemTx.execute(
              sql`DELETE FROM public.question_objectives WHERE question_id=${id}::uuid`,
            );
          }
          const deleted = await itemTx
            .delete(table)
            .where(eq(table.id, id))
            .returning({ id: table.id });
          if (deleted.length !== 1 || deleted[0]?.id !== id)
            throw Error("Permanent deletion affected an unexpected record set.");
          const retained = await itemTx
            .select({ id: table.id })
            .from(table)
            .where(eq(table.id, id))
            .limit(1);
          if (retained.length) throw Error("Permanent deletion absence verification failed.");
          return {
            id,
            outcome: "DELETED" as const,
            reason: "Permanently deleted; no protected dependencies.",
          };
        });
        outcomes.push(outcome);
      } catch (error) {
        if (!["23503", "23001", "55P03", "42501"].includes(code(error) ?? "")) throw error;
        // Savepoint rolled back links/status changes for this item.
        outcomes.push({
          id,
          outcome: "BLOCKED",
          ...(["23503", "23001"].includes(code(error) ?? "") &&
          /^[a-zA-Z0-9_]{1,63}$/.test(
            (error as { cause?: { constraint?: string }; constraint?: string }).cause?.constraint ??
              (error as { constraint?: string }).constraint ??
              "",
          )
            ? {
                constraint:
                  (error as { cause?: { constraint?: string }; constraint?: string }).cause
                    ?.constraint ?? (error as { constraint?: string }).constraint,
              }
            : {}),
          reason:
            code(error) === "42501"
              ? "The runtime role lacks the separately approved catalog DELETE permission. No privilege escalation or data change was attempted for this item."
              : ["23503", "23001"].includes(code(error) ?? "")
                ? "A foreign-key dependency prevented permanent deletion (SQLSTATE " +
                  code(error) +
                  "). The item savepoint was rolled back; records and status are unchanged."
                : "A concurrent lock prevented permanent deletion (SQLSTATE 55P03). Records and status are unchanged.",
        });
      }
    }
    return outcomes;
  });
  return {
    items,
    deleted: items.filter((i) => i.outcome === "DELETED").length,
    blocked: items.filter((i) => i.outcome === "BLOCKED").length,
  };
}
