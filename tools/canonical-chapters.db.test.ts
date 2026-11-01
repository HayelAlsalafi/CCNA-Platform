import {portableRoot,workspaceRoot} from "./workspace-root.mjs";
// Explicit isolated-only suite. No application connection or credential loading.
import { it, expect, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import * as schema from "@workspace/db/schema";
vi.mock("@workspace/db", async () => ({
  ...(await import("@workspace/db/schema")),
  db: undefined,
}));
import { restoreBackupProof } from "./question-bank-restore.mjs";
import { canonicalSources } from "./canonical-chapters-policy.mjs";
import { verifyResetBackup, resetCanonicalTransaction } from "./canonical-chapters-reset.mjs";
import { migratorClient } from "./phase6a-local/upgrade.mjs";
import { compareUsersToBackup,readArchivedUsers } from './canonical-user-drift.mjs';
import {sterileEnvironment} from './question-bank-disposable-access.mjs';
import {
  createAdminQuestion,
  updateAdminQuestion,
} from "../artifacts/api-server/src/lib/questions-admin";
import { chapterCatalog, saveChapter } from "../artifacts/api-server/src/lib/canonical-chapters";
import { listStudioQuestions, studioLookup } from "../artifacts/api-server/src/lib/question-studio";
import { curriculumSummary } from "../artifacts/api-server/src/lib/curriculum";
import {
  previewQuestionImport,
  confirmQuestionImport,
} from "../artifacts/api-server/src/lib/question-import";
import {
  nexusAvailability,
  nexusAnalytics,
  nexusStartSession,
  nexusSaveSelection,
  nexusFinish,
  nexusSessionHistory,
  nexusSession,
} from "../artifacts/api-server/src/lib/nexus";
import { learningEvidence } from "../artifacts/api-server/src/lib/learning-evidence";
const root = portableRoot;
it.skipIf(process.env.RUN_CANONICAL_DISPOSABLE_TESTS !== "1")(
  "restores, resets and verifies actual chapter-backed Admin/import/practice/progress workflows, then rolls everything back",
  async () => {
    const { plan, catalog } = canonicalSources(root);
    verifyResetBackup(root, plan);
    const result = await restoreBackupProof(
      root,
      plan.backup.path,
      plan.backup.path.replace("before-upgrade.dump", "restore-proof.json"),
      async (client: any) => {
      // Validate the SELECT-only diagnostic against actual PostgreSQL timestamp
      // representations. The probe changes only the restored disposable copy.
      const archivedUsers=readArchivedUsers(plan.backup.path,sterileEnvironment());
      expect((await compareUsersToBackup(client,archivedUsers,plan.rowProof.users)).differenceCount).toBe(0);
      await client.query('SAVEPOINT canonical_user_drift_probe');
      await client.query("UPDATE public.users SET updated_at=updated_at+interval '1 microsecond',last_login_at=coalesce(last_login_at,updated_at)+interval '1 microsecond' WHERE id=(SELECT id FROM public.users ORDER BY id LIMIT 1)");
      const drift=await compareUsersToBackup(client,archivedUsers,plan.rowProof.users);
      expect(drift.routineTimestampFieldsOnly).toBe(true);expect(drift.changedAccounts).toBe(1);
      expect(drift.differences.map((r:any)=>r.field).sort()).toEqual(['last_login_at','updated_at']);
      await client.query('ROLLBACK TO SAVEPOINT canonical_user_drift_probe');
      await client.query('RELEASE SAVEPOINT canonical_user_drift_probe');
        const reset = await resetCanonicalTransaction(client, root, {
          owner: "ccna_taxonomy_rehearsal_owner_8e6c4b9a2170",
          privateRehearsal: true,
        });
        const boundary = migratorClient(client);
        // A disposable outer maintenance transaction holds every table lock. Service
        // read transactions become savepoints here; production isolation is untouched.
        const db = drizzle(
          {
            query: (query: any, args: any) => {
              const text = typeof query === "string" ? query : query.text;
              if (/^begin isolation level repeatable read read only$/i.test(text))
                return boundary.query("begin", args);
              return boundary.query(query, args);
            },
          } as any,
          { schema },
        );
        const data = await chapterCatalog(db);
        expect(data.chapters).toHaveLength(48);
        const first: any = data.chapters[0];
        await saveChapter(
          {
            code: first.code,
            description: "Isolated chapter metadata edit",
            status: "ACTIVE",
            displayOrder: 0,
            expectedVersion: first.version,
          },
          first.id,
          db,
        );
        await expect(
          saveChapter(
            {
              code: first.code,
              description: "Stale edit",
              status: "ACTIVE",
              displayOrder: 0,
              expectedVersion: first.version,
            },
            first.id,
            db,
          ),
        ).rejects.toMatchObject({ code: "CONFLICT" });
        const [learner] = await db
          .insert(schema.usersTable)
          .values({
            clerkUserId: "canonical-fixture-" + randomUUID(),
            email: "fixture@example.invalid",
            displayName: "Isolated chapter fixture",
          })
          .returning();
        const chapter = catalog.chapters.find((c: any) => c.code === "CCNA-V1-08");
        const question = {
          topicId: chapter.topicId,
          text: "Isolated VLAN complete-set fixture",
          type: "MULTIPLE_CHOICE_MULTIPLE",
          difficulty: "MEDIUM",
          explanation: "Select the complete correct set.",
          status: "ACTIVE",
          options: ["A", "B", "C", "D"].map((optionKey, i) => ({
            optionKey,
            text: "Fixture choice " + optionKey,
            isCorrect: i < 2,
          })),
        };
        const q = await createAdminQuestion(question, db);
        const revisions = (
          await client.query(
            "SELECT id,content_hash FROM public.question_revisions WHERE question_id=$1 ORDER BY created_at,id",
            [q.id],
          )
        ).rows;
        await updateAdminQuestion(q.id, { text: "Isolated updated VLAN complete-set fixture" }, db);
        const after = (
          await client.query(
            "SELECT id,content_hash FROM public.question_revisions WHERE question_id=$1 ORDER BY created_at,id",
            [q.id],
          )
        ).rows;
        expect(after).toHaveLength(2);
        expect(after.find((r: any) => r.id === revisions[0].id)).toEqual(revisions[0]);
        const single = await createAdminQuestion(
          {
            ...question,
            text: "Isolated single-answer fixture",
            type: "MULTIPLE_CHOICE_SINGLE",
            options: question.options.map((o: any, i: number) => ({ ...o, isCorrect: i === 0 })),
          },
          db,
        );
        const lookup = await studioLookup({ kind: "topics", search: "CCNA-V1-08" }, db);
        expect(lookup.items.some((i: any) => i.id === chapter.topicId)).toBe(true);
        const list = await listStudioQuestions({ chapterId: chapter.topicId }, db);
        expect(list.total).toBe(2);
        expect(list.items.every((i: any) => i.chapterIds[0] === chapter.topicId)).toBe(true);
        const nav = await curriculumSummary(db);
        expect(
          nav.domains.flatMap((d: any) => d.sections.flatMap((s: any) => s.chapters)),
        ).toHaveLength(48);
        const file = Buffer.from(
          "chapterCode,text,difficulty,optionA,optionB,correctOption,explanation\nCCNA-V2-19,Isolated import draft,EASY,Choice A,Choice B,A,Fixture explanation\n",
        );
        const preview = await previewQuestionImport(
          { filename: "chapters.csv", dataBase64: file.toString("base64") },
          "isolated-admin-session",
          db,
        );
        expect(preview.summary.accepted).toBe(1);
        const imported = await confirmQuestionImport(
          { previewId: preview.previewId, confirmed: true },
          "isolated-admin-session",
          db,
        );
        expect(imported.imported).toBe(1);
        expect(imported.status).toBe("DISABLED");
        expect(
          (
            await client.query("SELECT status,topic_id FROM public.questions WHERE id=$1", [
              imported.questionIds[0],
            ])
          ).rows[0],
        ).toEqual({
          status: "DISABLED",
          topic_id: catalog.chapters.find((c: any) => c.code === "CCNA-V2-19").topicId,
        });
        const domain = plan.catalog.domains.find((d: any) => d.code === "2.0");
        expect((await nexusAvailability({ domainId: domain.id }, learner.id, db)).available).toBe(
          2,
        );
        const run = await nexusStartSession(
          { domainId: domain.id, count: 2, mode: "PRACTICE", requestId: randomUUID() },
          learner.id,
          "isolated-session",
          db,
        );
        expect(run.questions.map((r: any) => r.id).sort()).toEqual([q.id, single.id].sort());
        expect(JSON.stringify(run.questions)).not.toMatch(/isCorrect|correctOptions|explanation/);
        for (const item of run.questions)
          await nexusSaveSelection(
            run.id,
            {
              questionId: item.id,
              optionKey: item.type === "MULTIPLE_CHOICE_MULTIPLE" ? '["B","A"]' : "A",
              flagged: false,
            },
            learner.id,
            "isolated-session",
            db,
          );
        await nexusFinish(run.id, learner.id, "isolated-session", false, db);
        const finished = await nexusSession(run.id, learner.id, "isolated-session", db);
        expect(finished.questions.every((i: any) => i.result.isCorrect)).toBe(true);
        expect((await nexusSessionHistory(learner.id, {}, db)).total).toBe(1);
        const analytics = await nexusAnalytics(learner.id, "isolated-session", "all", db);
        const metrics = analytics.domains.find((d: any) => d.code === "2.0");
        expect(metrics.chapters).toBe(10);
        expect(metrics.covered_chapters).toBe(1);
        expect(metrics.correct).toBe(2);
        const evidence = await learningEvidence(learner.id, "UTC", db);
        expect(evidence).toBeDefined();
        return {
          reset,
          adminCreateAndEdit: true,
          immutableRevisions: true,
          chapterLookupAndFilters: true,
          importDraft: true,
          practiceSingleAndMultipleGrading: true,
          progressAndHistory: true,
          learnerAnswerLeak: false,
        };
      },
    );
    expect(result.rolledBack).toBe(true);
    writeFileSync(
      root + "/.local/canonical-metadata/workflows.json",
      JSON.stringify(result, null, 2) + "\n",
    );
  },
  120000,
);
