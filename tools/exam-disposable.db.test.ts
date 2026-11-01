// Isolated, rollback-only integration: never application credentials or targets.
import { it, expect, vi } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "@workspace/db/schema";
vi.mock("@workspace/db", async () => ({
  ...(await import("@workspace/db/schema")),
  db: undefined,
}));
import { withDisposableAccess, disposable } from "./question-bank-disposable-access.mjs";
import { migrationManifest } from "./phase6a-local/policy.mjs";
import { assertDisposableLedger, rowProof } from "./question-bank-upgrade-core.mjs";
import { migratorClient } from "./phase6a-local/upgrade.mjs";
import {
  examAvailability,
  examStart,
  examSession,
  examSave,
  examSubmit,
  examHistory,
} from "../artifacts/api-server/src/lib/exams";
import { createQuestion, updateQuestion } from "../artifacts/api-server/src/lib/questions";
const root = process.cwd(),
  hash = (b: any) => createHash("sha256").update(b).digest("hex");
it.skipIf(process.env.RUN_EXAM_DISPOSABLE_TESTS !== "1")(
  "actual Drizzle exam migration, persistence, grading, expiry, deletion and full rollback",
  async () => {
    const pins = JSON.parse(readFileSync("tools/exam-migration-manifest.json", "utf8"));
    for (const [file, digest] of Object.entries(pins.files))
      expect(hash(readFileSync(file))).toBe(digest);
    const source = migrationManifest(root);
    expect(source).toHaveLength(12);
    const folder = path.join(root, ".local/exam-rehearsal", randomUUID());
    mkdirSync(path.join(folder, "meta"), { recursive: true });
    const journal = JSON.parse(
      readFileSync("lib/db/drizzle/proposed/meta/0012_journal.json", "utf8"),
    );
    for (const e of journal.entries)
      writeFileSync(
        path.join(folder, e.tag + ".sql"),
        readFileSync("lib/db/drizzle/" + (e.idx === 12 ? "proposed/" : "") + e.tag + ".sql"),
      );
    writeFileSync(path.join(folder, "meta/_journal.json"), JSON.stringify(journal));
    await withDisposableAccess(root, async ({ data }: any) => {
      const req = createRequire(path.join(root, "lib/db/package.json")),
        client = new (req("pg").Client)({
          ...disposable,
          application_name: "ccna-exam-rollback-only",
        });
      client.on("error", () => {});
      await client.connect();
      let before: any,
        proof: any,
        tables: string[] = [];
      try {
        const identity = (
          await client.query(
            "SELECT current_database() AS database,current_user AS owner,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('data_directory') AS directory,current_setting('server_version_num')::int AS version",
          )
        ).rows[0];
        expect(identity).toEqual({
          database: disposable.database,
          owner: disposable.user,
          host: "127.0.0.1",
          port: 55440,
          directory: data.replaceAll("\\", "/"),
          version: 180006,
        });
        before = (
          await client.query(
            "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id",
          )
        ).rows;
        expect(before).toHaveLength(7);
        assertDisposableLedger(before, source.slice(0, 7));
        tables = (
          await client.query(
            "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
          )
        ).rows.map((r: any) => r.tablename);
        const direct = drizzle(client, { schema });
        proof = await rowProof(direct as any, tables);
        expect(Object.values(proof).every((p: any) => p.count === 0)).toBe(true);
        await client.query("BEGIN");
        const db = drizzle(migratorClient(client) as any, { schema });
        await migrate(db, { migrationsFolder: folder });
        expect(
          (await client.query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations"))
            .rows[0].n,
        ).toBe(13);
        await migrate(db, { migrationsFolder: folder });
        expect(
          (await client.query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations"))
            .rows[0].n,
        ).toBe(13);
        const catalog = JSON.parse(readFileSync("lib/canonical-chapters.json", "utf8")),
          blueprint = randomUUID(),
          owner = randomUUID(),
          other = randomUUID(),
          admin = randomUUID();
        for (const [id, role] of [
          [owner, "USER"],
          [other, "USER"],
          [admin, "ADMIN"],
        ])
          await client.query(
            "INSERT INTO public.users(id,clerk_user_id,email,display_name,role) VALUES($1,$2,$3,'Synthetic exam fixture',$4)",
            [id, "exam-fixture-" + id, id + "@example.invalid", role],
          );
        await client.query(
          "INSERT INTO public.exam_blueprints(id,exam_code,version,title,status,source_url,verified_at) VALUES($1,'200-301','1.1','Synthetic exam blueprint','ACTIVE','https://example.invalid/exam',clock_timestamp())",
          [blueprint],
        );
        const domainIds = new Map<string, string>();
        for (const [i, d] of catalog.domains.entries()) {
          const id = randomUUID();
          domainIds.set(d.code, id);
          await client.query(
            "INSERT INTO public.exam_domains(id,blueprint_id,code,name,weight_percent,display_order) VALUES($1,$2,$3,$4,$5,$6)",
            [id, blueprint, d.code, d.name, d.examWeight, i],
          );
        }
        for (const [i, c] of catalog.chapters.entries()) {
          await client.query(
            "INSERT INTO public.topics(id,slug,name,display_order) VALUES($1,$2,$3,$4)",
            [c.topicId, c.slug, c.title, i],
          );
          await client.query(
            "INSERT INTO public.curriculum_chapters(id,blueprint_id,domain_id,domain_code,code,volume,chapter_number) VALUES($1,$2,$3,$4,$5,$6,$7)",
            [
              c.topicId,
              blueprint,
              domainIds.get(c.primaryDomain),
              c.primaryDomain,
              c.code,
              c.volume,
              c.chapterNumber,
            ],
          );
        }
        const chapter = catalog.chapters[0];
        const question = (multi: boolean, status = "ACTIVE") => ({
          topicId: chapter.topicId,
          text: multi ? "Select transport protocols." : "Select UDP.",
          type: multi ? "MULTIPLE_CHOICE_MULTIPLE" : "MULTIPLE_CHOICE_SINGLE",
          difficulty: "MEDIUM",
          status,
          explanation: "UDP and TCP are transport protocols.",
          options: [
            { optionKey: "A", text: "UDP", isCorrect: true },
            { optionKey: "B", text: "TCP", isCorrect: multi },
            { optionKey: "C", text: "Ethernet", isCorrect: false },
          ],
        });
        const { question: single } = await createQuestion(question(false), db as any);
        const { question: multiple } = await createQuestion(question(true), db as any);
        await createQuestion(question(false, "DISABLED"), db as any);
        const availability = await examAvailability({}, db as any);
        expect(availability.available).toBe(2);
        expect(availability.chapters).toHaveLength(48);
        expect(
          (await examAvailability({ domainIds: [domainIds.get("2.0")] }, db as any)).available,
        ).toBe(0);
        expect(
          (await examAvailability({ chapterIds: [chapter.topicId] }, db as any)).available,
        ).toBe(2);
        const input = { requestId: randomUUID(), questionCount: 2, durationMinutes: 5 };
        await expect(
          examStart({ ...input, questionCount: 3 }, owner, "auth-a", db as any),
        ).rejects.toMatchObject({ code: "AVAILABILITY_CHANGED" });
        let run = await examStart(input, owner, "auth-a", db as any);
        expect(run.questions).toHaveLength(2);
        expect(JSON.stringify(run)).not.toContain("isCorrect");
        expect(JSON.stringify(run)).not.toContain("explanation");
        expect((await examStart(input, owner, "auth-a", db as any)).id).toBe(run.id);
        await expect(
          examStart({ ...input, questionCount: 1 }, owner, "auth-a", db as any),
        ).rejects.toMatchObject({ code: "REQUEST_CONFLICT" });
        await expect(examSession(run.id, other, db as any)).rejects.toMatchObject({ status: 404 });
        await expect(examSubmit(run.id, other, db as any)).rejects.toMatchObject({ status: 404 });
        for (const q of run.questions) {
          run = await examSave(
            run.id,
            q.deliveryId,
            {
              selectedOptionKeys: q.type === "MULTIPLE_CHOICE_MULTIPLE" ? ["B", "A"] : ["A"],
              flagged: true,
              expectedVersion: 0,
            },
            owner,
            db as any,
          );
        }
        expect(
          (await examSession(run.id, owner, db as any)).questions.every((q: any) => q.flagged),
        ).toBe(true);
        await expect(
          examSave(
            run.id,
            run.questions[0].deliveryId,
            { selectedOptionKeys: [], flagged: false, expectedVersion: 0 },
            owner,
            db as any,
          ),
        ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
        // Live edits cannot rewrite the delivered immutable revision or mapping.
        await updateQuestion(
          single.id,
          { text: "Edited later", explanation: "Changed later" },
          db as any,
        );
        const completed = await examSubmit(run.id, owner, db as any);
        expect(completed.result).toMatchObject({ correct: 2, total: 2, percentage: 100 });
        expect(completed.questions.some((q: any) => q.text === "Select UDP.")).toBe(true);
        expect((await examSubmit(run.id, owner, db as any)).result).toEqual(completed.result);
        await expect(
          examSave(
            run.id,
            run.questions[0].deliveryId,
            { selectedOptionKeys: [], flagged: false, expectedVersion: 1 },
            owner,
            db as any,
          ),
        ).rejects.toMatchObject({ code: "EXAM_CLOSED" });
        expect((await examHistory({}, other, db as any)).total).toBe(0);
        expect((await examHistory({}, owner, db as any)).total).toBe(1);
        expect(
          (await client.query("SELECT count(*)::int AS n FROM public.practice_attempts")).rows[0].n,
        ).toBe(0);
        // An authentic five-minute deadline only three seconds away: no clock bypass.
        const expiredId = randomUUID(),
          revision = (
            await client.query(
              "SELECT * FROM public.question_revisions WHERE question_id=$1 LIMIT 1",
              [multiple.id],
            )
          ).rows[0];
        await client.query(
          "INSERT INTO public.exam_sessions(id,user_id,request_id,auth_session_id,config,question_count,started_at,deadline_at) SELECT $1,$2,$3,'auth-a','{}',1,t-interval '297 seconds',t+interval '3 seconds' FROM (SELECT clock_timestamp() AS t) c",
          [expiredId, owner, randomUUID()],
        );
        await client.query(
          "INSERT INTO public.exam_session_items(session_id,user_id,position,question_id,revision_id,mapping_snapshot) VALUES($1,$2,0,$3,$4,$5)",
          [expiredId, owner, multiple.id, revision.id, JSON.stringify(run.questions[0].mapping)],
        );
        await new Promise((r) => setTimeout(r, 3200));
        const expired = await examSession(expiredId, owner, db as any);
        expect(expired.needsFinalization).toBe(true);
        await expect(
          examSave(
            expiredId,
            expired.questions[0].deliveryId,
            { selectedOptionKeys: ["A", "B"], flagged: false, expectedVersion: 0 },
            owner,
            db as any,
          ),
        ).rejects.toMatchObject({ code: "EXAM_CLOSED" });
        expect(await examSubmit(expiredId, owner, db as any)).toMatchObject({
          status: "EXPIRED",
          result: { unanswered: 1, completionSeconds: 300 },
        });
        // Ordinary deletion fails with history; only explicit controlled deletion redacts.
        await client.query("SAVEPOINT delete_refusal");
        await expect(
          client.query("SELECT public.delete_question_without_learner_history($1,$2)", [
            single.id,
            admin,
          ]),
        ).rejects.toMatchObject({
          code: "23514",
          constraint: "question_history_confirmation_required",
        });
        await client.query("ROLLBACK TO SAVEPOINT delete_refusal");
        await client.query("RELEASE SAVEPOINT delete_refusal");
        const receipt = (
          await client.query("SELECT public.delete_question_with_history($1,$2) AS receipt", [
            single.id,
            admin,
          ])
        ).rows[0].receipt;
        expect(receipt.examItems).toBe(1);
        expect(
          (await client.query("SELECT id FROM public.questions WHERE id=$1", [single.id])).rows,
        ).toHaveLength(0);
        const afterDelete = await examSession(run.id, owner, db as any);
        expect(afterDelete.contentRemoved).toBe(true);
        expect(afterDelete.questions.filter((q: any) => q.removed)).toHaveLength(1);
        expect(afterDelete.result).toEqual(completed.result);
        expect(
          (await client.query("SELECT count(*)::int AS n FROM public.curriculum_chapters")).rows[0]
            .n,
        ).toBe(48);
        await client.query("ROLLBACK");
        expect(
          (
            await client.query(
              "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id",
            )
          ).rows,
        ).toEqual(before);
        expect(await rowProof(direct as any, tables)).toEqual(proof);
        expect(
          (await client.query("SELECT to_regclass('public.exam_sessions') AS relation")).rows[0]
            .relation,
        ).toBeNull();
      } finally {
        await client.query("ROLLBACK").catch(() => {});
        await client.end();
      }
    });
  },
  120000,
);
