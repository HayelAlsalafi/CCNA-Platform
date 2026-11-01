// Opt-in exact private database only. Full restoration and lesson work ROLLBACK.
import { it, expect, vi } from "vitest";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "@workspace/db/schema";
vi.mock("@workspace/db", async () => ({
  ...(await import("@workspace/db/schema")),
  db: undefined,
}));
import { withDisposableAccess, disposable } from "../question-bank-disposable-access.mjs";
import { assertDisposableLedger, rowProof } from "../question-bank-upgrade-core.mjs";
import { readSchemaCatalog, assertSchemaCatalog } from "../phase6a-local/upgrade.mjs";
import { transactionClient } from "./transaction-client.mjs";
import { decodeArchiveTables } from "../phase8a-cleanup/final-planner.mjs";
import { preparedPlan, verifyFreshBackup, stageMigrations } from "./staging.mjs";
import { assertLessonRevisionGuard, assertLessonPrivileges, lessonSnapshot } from "./policy.mjs";
import {
  adminLessonGet,
  chapterLessonList,
  createLesson,
  updateLesson,
  publishLesson,
  publishedLesson,
  lessonRevisions,
} from "../../artifacts/api-server/src/lib/lessons";

it.skipIf(process.env.RUN_LESSON_DISPOSABLE_TESTS !== "1")(
  "restores current backup, rehearses only 0013, preserves data and rolls back",
  async () => {
    const root = process.cwd(),
      plan = preparedPlan(root),
      { report, archive, folder: backupFolder } = verifyFreshBackup(root);
    const run = path.join(backupFolder, "lesson-rehearsal-" + randomUUID());
    mkdirSync(run);
    const beforeFolder = path.join(run, "baseline"),
      nextFolder = path.join(run, "lesson");
    stageMigrations(root, beforeFolder, false);
    stageMigrations(root, nextFolder, true);
    const expectedSnapshot = JSON.parse(
      readFileSync("lib/db/drizzle/meta/0011_snapshot.json", "utf8"),
    );
    const tables = Object.values(expectedSnapshot.tables)
      .map((t: any) => t.name)
      .sort();
    const outcomes: Record<string, boolean> = {};
    await withDisposableAccess(root, async ({ data, env }: any) => {
      const require = createRequire(path.join(root, "lib/db/package.json"));
      const client = new (require("pg").Client)({
        ...disposable,
        application_name: "ccna-lesson-restore-rehearsal",
      });
      client.on("error", () => {});
      await client.connect();
      let initialLedger: any, initialCatalog: any, initialProof: any;
      const initialSequences: Record<string, any> = {};
      const sequenceRead = async () => {
        const result: Record<string, any> = {};
        for (const name of ["public.question_code_seq", "drizzle.__drizzle_migrations_id_seq"])
          result[name] = (
            await client.query(`SELECT last_value::text,is_called FROM ${name}`)
          ).rows[0];
        return result;
      };
      const rollbackError = async (action: () => Promise<unknown>, code: string) => {
        await client.query("SAVEPOINT expected_lesson_failure");
        try {
          await action();
          throw Error("Expected database rejection");
        } catch (error: any) {
          expect(error.code ?? error.cause?.code).toBe(code);
        } finally {
          await client.query("ROLLBACK TO SAVEPOINT expected_lesson_failure");
          await client.query("RELEASE SAVEPOINT expected_lesson_failure");
        }
      };
      try {
        const identity = (
          await client.query(
            "SELECT current_database() AS database,current_user AS owner,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('data_directory') AS directory,current_setting('server_version_num')::int AS version,(pg_control_system()).system_identifier::text AS system",
          )
        ).rows[0];
        expect(identity).toMatchObject({
          database: disposable.database,
          owner: disposable.user,
          host: "127.0.0.1",
          port: 55440,
          directory: data.replaceAll("\\", "/"),
          version: 180006,
        });
        expect(identity.system).not.toBe(report.identity.systemIdentifier);
        initialLedger = (
          await client.query(
            "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id",
          )
        ).rows;
        expect(initialLedger).toHaveLength(7);
        assertDisposableLedger(initialLedger, plan.manifest.slice(0, 7));
        initialCatalog = await readSchemaCatalog(client);
        expect(initialCatalog.tables.every((t: any) => t.owner === disposable.user)).toBe(true);
        initialProof = await rowProof(
          client,
          initialCatalog.tables.map((t: any) => t.name),
        );
        expect(Object.values(initialProof).every((t: any) => t.count === 0)).toBe(true);
        Object.assign(initialSequences, await sequenceRead());
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
        await client.query(
          "SET LOCAL TIME ZONE 'UTC'; SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='180s'",
        );
        // Sequence changes are nontransactional; exact original private values are restored below.
        await client.query("SELECT setval('drizzle.__drizzle_migrations_id_seq',7,true)");
        const db = drizzle(transactionClient(client) as any, { schema });
        await migrate(db, { migrationsFolder: beforeFolder });
        assertDisposableLedger(
          (
            await client.query(
              "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id",
            )
          ).rows,
          plan.manifest.slice(0, 12),
        );
        const baselineCatalog = await readSchemaCatalog(client);
        assertSchemaCatalog(
          {
            ...baselineCatalog,
            tables: baselineCatalog.tables.map((t: any) => ({
              ...t,
              owner: "ccna_phase6a_migrator",
            })),
          },
          expectedSnapshot,
        );
        const decoded = decodeArchiveTables(
          execFileSync(
            "C:/Program Files/PostgreSQL/18/bin/pg_restore.exe",
            [
              "--data-only",
              "--schema=public",
              "--no-owner",
              "--no-privileges",
              "--file=-",
              archive,
            ],
            {
              env,
              encoding: "utf8",
              timeout: 120000,
              maxBuffer: 128 * 1024 * 1024,
              windowsHide: true,
            },
          ),
        );
        expect(Object.keys(decoded).sort()).toEqual(tables);
        const order = [
          "users",
          "topics",
          "exam_blueprints",
          "exam_domains",
          "curriculum_chapters",
          "questions",
          "question_options",
          "exam_objectives",
          "question_objectives",
          "question_revisions",
          "practice_deliveries",
          "practice_attempts",
          "learning_sessions",
          "achievement_definitions",
          "learner_achievements",
          "question_deletion_audits",
          "learning_session_items",
        ];
        // Historical import only, exact private DB and transaction. Every FK/CHECK and
        // immutable UPDATE/DELETE guard stays enabled. Re-enable both INSERT policies.
        await client.query(
          "ALTER TABLE public.practice_attempts DISABLE TRIGGER practice_attempts_validate_revision",
        );
        await client.query(
          "ALTER TABLE public.practice_attempts DISABLE TRIGGER nexus_deferred_grading",
        );
        for (const table of order) {
          const columns = (expectedSnapshot.tables as any)["public." + table].columns;
          const rows = decoded[table];
          assert(rows);
          for (const row of rows) {
            expect(Object.keys(row).sort()).toEqual(Object.keys(columns).sort());
            for (const [key, column] of Object.entries(columns) as any)
              if (row[key] !== null && column.type === "jsonb") row[key] = JSON.parse(row[key]);
          }
          for (let start = 0; start < rows.length; start += 250) {
            const update =
              table === "achievement_definitions"
                ? " ON CONFLICT(id) DO UPDATE SET " +
                  Object.keys(columns)
                    .filter((c) => c !== "id")
                    .map((c) => `"${c}"=excluded."${c}"`)
                    .join(",")
                : "";
            await client.query(
              `INSERT INTO public."${table}" SELECT * FROM jsonb_populate_recordset(NULL::public."${table}",$1::jsonb)${update}`,
              [JSON.stringify(rows.slice(start, start + 250))],
            );
          }
        }
        await client.query(
          "ALTER TABLE public.practice_attempts ENABLE TRIGGER practice_attempts_validate_revision",
        );
        await client.query(
          "ALTER TABLE public.practice_attempts ENABLE TRIGGER nexus_deferred_grading",
        );
        await client.query("SET CONSTRAINTS ALL IMMEDIATE");
        expect(await rowProof(client, tables)).toEqual(report.rowProof);
        outcomes.freshBackupRestored = true;
        for (const [qualified, sequence] of Object.entries(report.sequences) as any)
          await client.query("SELECT setval($1::regclass,$2::bigint,$3)", [
            qualified,
            sequence.last_value,
            sequence.is_called,
          ]);
        const preservedSequences = await sequenceRead();
        // Deliberate server error after the first CREATE: actual Drizzle must roll
        // its savepoint back, leaving neither partial lesson DDL nor a ledger row.
        const faultClient = transactionClient(client);
        let injected = false;
        const failingDb = drizzle({
          query(query: any, params: any) {
            const sql = typeof query === "string" ? query : query.text;
            if (!injected && sql.includes("CREATE TABLE public.lesson_revisions")) {
              injected = true;
              return client.query("SELECT 1/0");
            }
            return faultClient.query(query, params);
          },
        } as any);
        await expect(migrate(failingDb, { migrationsFolder: nextFolder })).rejects.toMatchObject({
          cause: { code: "22012" },
        });
        expect(injected).toBe(true);
        expect(
          (
            await client.query(
              "SELECT to_regclass('public.lessons') AS lessons,to_regclass('public.lesson_revisions') AS revisions",
            )
          ).rows[0],
        ).toEqual({ lessons: null, revisions: null });
        expect(
          (await client.query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations"))
            .rows[0].n,
        ).toBe(12);
        expect(await rowProof(client, tables)).toEqual(report.rowProof);
        outcomes.migrationFailureRollback = true;
        await migrate(db, { migrationsFolder: nextFolder });
        assertDisposableLedger(
          (
            await client.query(
              "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id",
            )
          ).rows,
          plan.manifest,
        );
        await migrate(db, { migrationsFolder: nextFolder });
        expect(
          (await client.query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations"))
            .rows[0].n,
        ).toBe(13);
        outcomes.migratorAndRepeat = true;
        const lessonCatalog = await readSchemaCatalog(client);
        assertSchemaCatalog(
          {
            ...lessonCatalog,
            tables: lessonCatalog.tables.map((t: any) => ({
              ...t,
              owner: "ccna_phase6a_migrator",
            })),
          },
          lessonSnapshot(root),
        );
        await assertLessonRevisionGuard(client, root, disposable.user);
        outcomes.constraintsAndTrigger = true;
        const actor = (
          await client.query(
            "SELECT id FROM public.users WHERE role='ADMIN' AND status='ACTIVE' ORDER BY id LIMIT 1",
          )
        ).rows[0]?.id;
        assert(actor);
        const chapter = (
          await client.query("SELECT id FROM public.curriculum_chapters ORDER BY id LIMIT 1")
        ).rows[0].id;
        const input = {
          chapterId: chapter,
          title: "Isolated lesson rehearsal",
          description: "Synthetic only; rolled back",
          objectives: ["Verify safe lesson persistence"],
          estimatedMinutes: 3,
          displayOrder: 0,
          blocks: [
            {
              id: randomUUID(),
              type: "paragraph" as const,
              text: "TCP provides reliable ordered transport.",
            },
          ],
        };
        const draft = (await createLesson(input, actor, db as any)).lesson as any;
        expect(draft.status).toBe("DRAFT");
        expect((await adminLessonGet(draft.id, db as any)).lesson.title).toBe(input.title);
        expect((await chapterLessonList(chapter, db as any)).items).toHaveLength(0);
        await expect(publishedLesson(draft.id, db as any)).rejects.toMatchObject({ status: 404 });
        outcomes.draftAndVisibility = true;
        const edited = (
          await updateLesson(
            draft.id,
            { ...input, title: "Edited rehearsal" },
            draft.version,
            actor,
            db as any,
          )
        ).lesson as any;
        await expect(
          updateLesson(draft.id, input, draft.version, actor, db as any),
        ).rejects.toMatchObject({ status: 409 });
        const published = (await publishLesson(draft.id, edited.version, actor, true, db as any))
          .lesson as any;
        expect((await publishedLesson(draft.id, db as any)).lesson.title).toBe("Edited rehearsal");
        const working = (
          await updateLesson(
            draft.id,
            { ...input, title: "Unpublished working copy" },
            published.version,
            actor,
            db as any,
          )
        ).lesson as any;
        expect((await publishedLesson(draft.id, db as any)).lesson.title).toBe("Edited rehearsal");
        expect((await lessonRevisions(draft.id, db as any)).items).toHaveLength(1);
        outcomes.publicationSnapshots = true;
        await rollbackError(
          () =>
            client.query(
              "UPDATE public.lesson_revisions SET revision_number=99 WHERE lesson_id=$1",
              [draft.id],
            ),
          "23001",
        );
        await rollbackError(
          () =>
            client.query("UPDATE public.lessons SET chapter_id=$1 WHERE id=$2", [
              randomUUID(),
              draft.id,
            ]),
          "23503",
        );
        const second = (await createLesson({ ...input, title: "Another lesson" }, actor, db as any))
          .lesson as any;
        await rollbackError(
          () =>
            client.query("UPDATE public.lessons SET published_revision_id=$1 WHERE id=$2", [
              published.publishedRevisionId,
              second.id,
            ]),
          "23503",
        );
        outcomes.rejectsInvalidDependencies = true;
        const probe = "ccna_lesson_probe_" + randomUUID().replaceAll("-", "");
        await client.query(
          `CREATE ROLE "${probe}" NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
        );
        await client.query(
          `GRANT USAGE ON SCHEMA public TO "${probe}"; GRANT SELECT,INSERT,UPDATE ON public.lessons TO "${probe}"; GRANT SELECT,INSERT ON public.lesson_revisions TO "${probe}"`,
        );
        await assertLessonPrivileges(client, probe);
        await client.query(`SET LOCAL ROLE "${probe}"`);
        await rollbackError(
          () => client.query("DELETE FROM public.lessons WHERE id=$1", [draft.id]),
          "42501",
        );
        await rollbackError(
          () =>
            client.query(
              "UPDATE public.lesson_revisions SET revision_number=88 WHERE lesson_id=$1",
              [draft.id],
            ),
          "42501",
        );
        await client.query("RESET ROLE");
        outcomes.leastPrivilege = true;
        await publishLesson(draft.id, working.version, actor, false, db as any);
        await expect(publishedLesson(draft.id, db as any)).rejects.toMatchObject({ status: 404 });
        expect((await lessonRevisions(draft.id, db as any)).items).toHaveLength(1);
        expect(await rowProof(client, tables)).toEqual(report.rowProof);
        expect((await sequenceRead())["public.question_code_seq"]).toEqual(
          preservedSequences["public.question_code_seq"],
        );
        outcomes.applicationRowsPreserved = true;
        await client.query("ROLLBACK");
        expect(
          (
            await client.query(
              "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id",
            )
          ).rows,
        ).toEqual(initialLedger);
        expect(await readSchemaCatalog(client)).toEqual(initialCatalog);
        expect(
          await rowProof(
            client,
            initialCatalog.tables.map((t: any) => t.name),
          ),
        ).toEqual(initialProof);
        expect(
          (await client.query("SELECT rolname FROM pg_roles WHERE rolname=$1", [probe])).rows,
        ).toHaveLength(0);
        outcomes.rollbackVerified = true;
      } finally {
        await client.query("ROLLBACK").catch(() => {});
        for (const [qualified, sequence] of Object.entries(initialSequences) as any)
          await client.query("SELECT setval($1::regclass,$2::bigint,$3)", [
            qualified,
            sequence.last_value,
            sequence.is_called,
          ]);
        if (Object.keys(initialSequences).length)
          expect(await sequenceRead()).toEqual(initialSequences);
        if (initialLedger) {
          expect(
            (
              await client.query(
                "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id",
              )
            ).rows,
          ).toEqual(initialLedger);
          expect(await readSchemaCatalog(client)).toEqual(initialCatalog);
          expect(
            await rowProof(
              client,
              initialCatalog.tables.map((t: any) => t.name),
            ),
          ).toEqual(initialProof);
        }
        await client.end();
      }
    });
    outcomes.hbaRestored = true;
    const receipt = {
      stage: "complete",
      database: disposable.database,
      port: 55440,
      backupHash: report.backup.sha256,
      outcomes,
      applicationDatabaseConnections: 0,
      applicationWrites: 0,
      rolledBack: true,
      isolatedSequencesRestored: true,
      lessonOnly: true,
      report: path.join(run, "rehearsal.json"),
    };
    writeFileSync(receipt.report, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify(receipt));
  },
  120000,
);
