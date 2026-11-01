// Explicit opt-in, new private database only. No application credentials/env/URLs.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  isolated,
  backupRelative,
  backupHash,
  bin,
  privateConnection,
  withPrivateTarget,
  assertPrivateIdentity,
} from "./isolated-policy.mjs";
import { verifyBackup } from "./verify-backup.mjs";
import { readinessPlan } from "./readiness.mjs";
import { assertStudyProposal, studyMigration } from "./proposal.mjs";
import {
  proposedStudyManifest,
  assertStudyRuntimeCatalog,
  assertStudyPrivileges,
} from "./proposed-runtime-guard.mjs";
import { rowProof } from "../question-bank-upgrade-core.mjs";
import { readSchemaCatalog, assertSchemaCatalog } from "../phase6a-local/upgrade.mjs";
import { assertLedger } from "../phase6a-local/policy.mjs";
import { protectOperatorFolder, sterileEnvironment } from "../question-bank-disposable-access.mjs";

const fixturesResume = process.argv[2] === "--continue-fixtures";
const resuming = fixturesResume || process.argv[2] === "--continue-verified";
const root = realpathSync(process.cwd()),
  env = sterileEnvironment(),
  req = createRequire(path.join(root, "lib/db/package.json"));
const { Client } = req("pg"),
  { drizzle } = req("drizzle-orm/node-postgres"),
  { migrate } = req("drizzle-orm/node-postgres/migrator");
let stage = "offline-preflight",
  folder,
  client,
  other,
  receiptWritable = false;
const outcomes = {},
  report = {
    applicationDatabaseConnections: 0,
    applicationWrites: 0,
    sourcePromoted: false,
    mediaStorageChanged: false,
  };
const code = (e) => e?.code ?? e?.cause?.code;
const requireThat = (value, name) => assert(value, name);
function pass(name, details = true) {
  outcomes[name] = details;
  writeReceipt();
}
function writeReceipt() {
  if (folder && receiptWritable)
    writeFileSync(
      path.join(folder, "rehearsal.json"),
      JSON.stringify({ ...report, stage, outcomes }, null, 2) + "\n",
    );
}
async function expectSql(action, expected) {
  await client.query("BEGIN");
  try {
    let caught;
    try {
      await action();
    } catch (e) {
      caught = e;
    }
    assert(caught, "Expected SQL rejection");
    assert.equal(code(caught), expected);
  } finally {
    await client.query("ROLLBACK");
  }
}
async function rejectService(action, expected) {
  let caught;
  try {
    await action();
  } catch (e) {
    caught = e;
  }
  assert(caught, "Expected service rejection");
  assert.equal(code(caught), expected);
}
async function sequences(c) {
  const result = {};
  for (const name of ["public.question_code_seq", "drizzle.__drizzle_migrations_id_seq"])
    result[name] = (await c.query(`SELECT last_value::text,is_called FROM ${name}`)).rows[0];
  return result;
}
async function schemaMatches(c, snapshot) {
  const actual = await readSchemaCatalog(c);
  assert(
    actual.tables.every((t) => t.owner === isolated.owner),
    "Unexpected private restored ownership",
  );
  assertSchemaCatalog(
    { ...actual, tables: actual.tables.map((t) => ({ ...t, owner: "ccna_phase6a_migrator" })) },
    snapshot,
  );
}
function guardedRoleDatabase(c) {
  return drizzle({
    query: async (q, p) => {
      const text = typeof q === "string" ? q : q.text;
      const result = await c.query(q, p);
      if (/^begin(?:\s|$)/i.test(text.trim())) await c.query("SET LOCAL ROLE pg_read_all_settings");
      return result;
    },
  });
}
try {
  assert.equal(process.argv.length, 3);
  assert(
    ["--execute-isolated", "--continue-verified", "--continue-fixtures"].includes(process.argv[2]),
    "Explicit isolated execution/verified continuation only",
  );
  assert.equal(
    execFileSync("git", ["branch", "--show-current"], { env, encoding: "utf8" }).trim(),
    "main",
  );
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { env, encoding: "utf8" }).trim(),
    "3c07b4bb7fe807e60dcbcd5539c046b919a9956f",
  );
  const plan = readinessPlan(root),
    proposal = assertStudyProposal(root),
    backup = verifyBackup(root, path.join(root, backupRelative));
  assert.equal(backup.sha256, backupHash);
  const receipt = JSON.parse(readFileSync(path.join(root, backupRelative), "utf8"));
  const fixtureEvidence = fixturesResume
    ? JSON.parse(
        readFileSync(
          path.join(
            root,
            ".local/study-0014-rehearsal/2026-10-29T06-11-20.273Z-c04c0075-63c2-48bb-a0d9-f906b71db6c5/fixture-state.json",
          ),
          "utf8",
        ),
      )
    : null;
  const baseline = JSON.parse(
    readFileSync(path.join(root, "lib/db/drizzle/meta/0013_snapshot.json"), "utf8"),
  );
  const tables = Object.values(baseline.tables)
    .map((t) => t.name)
    .sort();
  mkdirSync(path.join(root, ".local/study-0014-rehearsal"), { recursive: true });
  if (resuming) {
    folder = path.join(
      root,
      ".local/study-0014-rehearsal/2026-10-29T06-11-20.273Z-c04c0075-63c2-48bb-a0d9-f906b71db6c5",
    );
    assert.equal(
      JSON.parse(readFileSync(path.join(folder, "rehearsal.json"), "utf8")).completed,
      false,
      "Completed rehearsal cannot be resumed",
    );
    const previous = JSON.parse(readFileSync(path.join(folder, "initial-rehearsal.json"), "utf8"));
    assert.equal(previous.completed, false);
    assert.equal(previous.stage, "official-drizzle-0014");
    assert.deepEqual(previous.target, isolated);
    assert.equal(previous.backup.sha256, backupHash);
    assert.equal(previous.outcomes.fullArchiveRestored.allRowsAndHashesMatched, true);
    assert.equal(previous.outcomes.genuineSqlFailureRolledBack.partialDDLAbsent, true);
    writeFileSync(
      path.join(folder, "continuation-attempt-" + randomUUID() + ".json"),
      readFileSync(path.join(folder, "rehearsal.json")),
      { flag: "wx" },
    );
    Object.assign(outcomes, previous.outcomes);
    report.priorGuardFailure = previous.failure;
  } else {
    folder = path.join(
      root,
      ".local/study-0014-rehearsal",
      new Date().toISOString().replaceAll(":", "-") + "-" + randomUUID(),
    );
    mkdirSync(folder);
    protectOperatorFolder(folder, env);
  }
  const work = path.join(folder, "work-" + randomUUID());
  mkdirSync(work);
  receiptWritable = true;
  report.target = isolated;
  report.backup = { ...backup, path: receipt.backup.path };
  report.proposal = plan.proposal;
  const staging = path.join(work, "migrations");
  mkdirSync(path.join(staging, "meta"), { recursive: true });
  for (const entry of proposal.journal.entries)
    writeFileSync(
      path.join(staging, entry.tag + ".sql"),
      readFileSync(
        path.join(root, "lib/db/drizzle", entry.idx === 13 ? "proposed" : "", entry.tag + ".sql"),
      ),
      { flag: "wx" },
    );
  writeFileSync(path.join(staging, "meta/_journal.json"), JSON.stringify(proposal.journal), {
    flag: "wx",
  });
  // Bundle service modules with an inert DB shim; application pool cannot load.
  const shim = path.join(work, "db-shim.mjs");
  writeFileSync(shim, "export const db = undefined;\n", { flag: "wx" });
  const entry = path.join(work, "services.mjs");
  writeFileSync(
    entry,
    `export * from ${JSON.stringify(path.join(root, "artifacts/api-server/src/lib/study.ts").replaceAll("\\", "/"))};\nexport * from ${JSON.stringify(path.join(root, "artifacts/api-server/src/lib/lessons.ts").replaceAll("\\", "/"))};\n`,
    { flag: "wx" },
  );
  process.env.ESBUILD_BINARY_PATH = path.join(
    root,
    ".local/native-deps/node_modules/.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe",
  );
  const built = req(
    path.join(root, "node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/lib/main.js"),
  ).buildSync({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: path.join(work, "services.cjs"),
    alias: { "@workspace/db": shim },
    metafile: true,
    logLevel: "silent",
  });
  assert(
    !Object.keys(built.metafile.inputs).some((p) =>
      p.replaceAll("\\", "/").endsWith("/lib/db/src/index.ts"),
    ),
    "Application pool import forbidden",
  );
  const services = req(path.join(work, "services.cjs"));
  await withPrivateTarget(root, async (state) => {
    let afterSequences;
    if (!resuming) {
      stage = "private-identity-and-new-database";
      writeReceipt();
      report.listener = state.listener;
      client = new Client(privateConnection("postgres"));
      client.on("error", () => {});
      await client.connect();
      report.identity = await assertPrivateIdentity(client, "postgres", state.data);
      assert.equal(
        (
          await client.query(
            "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=$1) AS exists",
            [isolated.database],
          )
        ).rows[0].exists,
        false,
        "Disposable database already exists; never reuse/reset it",
      );
      const forbidden = new Client({ ...privateConnection("postgres"), user: "postgres" });
      forbidden.on("error", () => {});
      try {
        let denied;
        try {
          await forbidden.connect();
        } catch (e) {
          denied = e;
        }
        assert(denied, "Unauthorized role was accepted");
        assert.equal(code(denied), "28000");
      } finally {
        await forbidden.end().catch(() => {});
      }
      pass("privateIdentityAndUnauthorizedAuthentication");
      await client.query(
        `CREATE DATABASE "${isolated.database}" OWNER "${isolated.owner}" TEMPLATE template0`,
      );
      report.databaseCreated = true;
      writeReceipt();
      await client.end();
      client = new Client(privateConnection(isolated.database));
      client.on("error", () => {});
      await client.connect();
      await assertPrivateIdentity(client, isolated.database, state.data);
      await client.query("SET TIME ZONE 'UTC'");
      const empty = (
        await client.query(
          "SELECT (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast' AND c.relkind IN ('r','p','v','m','f','S')) AS relations,(SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') AS functions",
        )
      ).rows[0];
      assert.deepEqual(empty, { relations: 0, functions: 0 });
      stage = "full-backup-restoration";
      writeReceipt();
      // A full archive restores data before post-data FKs/triggers; none are disabled.
      const ddl = execFileSync(
        bin + "pg_restore.exe",
        ["--schema-only", "--no-owner", "--no-privileges", "--file=-", receipt.backup.path],
        {
          env: state.env,
          encoding: "utf8",
          timeout: 30000,
          windowsHide: true,
          maxBuffer: 16 * 1024 * 1024,
        },
      );
      if (/^CREATE SCHEMA public;$/m.test(ddl)) await client.query("DROP SCHEMA public"); // exact newly-created empty DB only, no CASCADE
      execFileSync(
        bin + "pg_restore.exe",
        [
          "--host=127.0.0.1",
          "--port=55440",
          "--username=" + isolated.owner,
          "--dbname=" + isolated.database,
          "--no-password",
          "--no-owner",
          "--no-privileges",
          "--single-transaction",
          "--exit-on-error",
          receipt.backup.path,
        ],
        {
          env: {
            ...state.env,
            PGCONNECT_TIMEOUT: "5",
            PGOPTIONS: "-c statement_timeout=120000 -c lock_timeout=5000",
          },
          stdio: "pipe",
          timeout: 150000,
          windowsHide: true,
          maxBuffer: 8 * 1024 * 1024,
        },
      );
      await schemaMatches(client, baseline);
      const restoredLedger = (
        await client.query(
          "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id",
        )
      ).rows;
      assertLedger(restoredLedger, plan.manifest);
      assert.deepEqual(
        restoredLedger.map((r) => r.id),
        Array.from({ length: 13 }, (_, i) => i + 1),
      );
      assert.deepEqual(await rowProof(client, tables), receipt.rowProof);
      assert.deepEqual(await sequences(client), receipt.sequences);
      pass("fullArchiveRestored", {
        tables: 19,
        allRowsAndHashesMatched: true,
        ledgerEntries: 13,
        sequencesMatched: true,
        ownershipMappedOnlyToPrivateOwner: true,
        applicationACLNotApplied: true,
      });
      stage = "migration-failure-rollback";
      writeReceipt();
      let injected = false,
        caught;
      const failing = {
        query: (q, p) => {
          const text = typeof q === "string" ? q : q.text;
          if (!injected && text.includes("CREATE TABLE public.lesson_progress")) {
            injected = true;
            return client.query("SELECT 1/0");
          }
          return client.query(q, p);
        },
      };
      try {
        await migrate(drizzle(failing), { migrationsFolder: staging });
      } catch (e) {
        caught = e;
      }
      assert(injected);
      assert.equal(code(caught), "22012");
      assert.equal(
        (
          await client.query(
            "SELECT to_regclass('public.lesson_annotations') AS annotations,to_regclass('public.lesson_progress') AS progress,to_regclass('public.lesson_media') AS media",
          )
        ).rows[0].annotations,
        null,
      );
      await schemaMatches(client, baseline);
      assertLedger(
        (
          await client.query(
            "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id",
          )
        ).rows,
        plan.manifest,
      );
      assert.deepEqual(await rowProof(client, tables), receipt.rowProof);
      pass("genuineSqlFailureRolledBack", {
        sqlState: "22012",
        partialDDLAbsent: true,
        ledgerUnchanged: true,
      });
      stage = "official-drizzle-0014";
      writeReceipt();
      await migrate(drizzle(client), { migrationsFolder: staging });
      report.catalog = await assertStudyRuntimeCatalog(client, root, isolated.owner);
      assert.deepEqual(await rowProof(client, tables), receipt.rowProof);
      afterSequences = await sequences(client);
      assert.deepEqual(
        afterSequences["public.question_code_seq"],
        receipt.sequences["public.question_code_seq"],
      );
      pass("migration0014AndExistingDataPreserved");
      await migrate(drizzle(client), { migrationsFolder: staging });
      await assertStudyRuntimeCatalog(client, root, isolated.owner);
      assert.deepEqual(await sequences(client), afterSequences);
      assert.deepEqual(await rowProof(client, tables), receipt.rowProof);
      pass("repeatMigratorNoChanges");
      // No new cluster role or password: an existing NOLOGIN non-owner built-in role
      // receives only database-local rehearsal grants. Its attributes are unchanged.
    } else {
      stage = "verify-exact-prior-execution-state";
      writeReceipt();
      report.listener = state.listener;
      client = new Client(privateConnection(isolated.database));
      client.on("error", () => {});
      await client.connect();
      report.identity = await assertPrivateIdentity(client, isolated.database, state.data);
      await client.query("SET TIME ZONE 'UTC'");
      report.catalog = await assertStudyRuntimeCatalog(client, root, isolated.owner);
      const originalStateClient = fixturesResume
        ? {
            query: (q, p) => {
              const m = typeof q === "string" ? q.match(/FROM public\."([a-z_]+)" t$/) : null;
              return m && fixtureEvidence.excluded[m[1]]
                ? client.query(q + " WHERE t.id<>ALL($1::uuid[])", [fixtureEvidence.excluded[m[1]]])
                : client.query(q, p);
            },
          }
        : client;
      assert.deepEqual(await rowProof(originalStateClient, tables), receipt.rowProof);
      if (fixturesResume) {
        assert.equal(fixtureEvidence.database, isolated.database);
        assert.equal(fixtureEvidence.port, 55440);
        assert.equal(fixtureEvidence.allOriginalRowsMatched, true);
        assert.equal(fixtureEvidence.studyTablesEmpty, true);
        const l = (
          await client.query(
            "SELECT id,version,published_revision_id,created_by,updated_by,blocks,title FROM public.lessons WHERE id=$1",
            [fixtureEvidence.lessonId],
          )
        ).rows[0];
        assert.deepEqual(l, {
          id: fixtureEvidence.lessonId,
          version: 2,
          published_revision_id: fixtureEvidence.revisionId,
          created_by: fixtureEvidence.actor,
          updated_by: fixtureEvidence.actor,
          blocks: fixtureEvidence.input.blocks,
          title: fixtureEvidence.input.title,
        });
        assert.equal(
          (
            await client.query(
              "SELECT count(*)::int AS n FROM public.users WHERE id=ANY($1::uuid[])",
              [fixtureEvidence.excluded.users],
            )
          ).rows[0].n,
          3,
        );
        assert.equal(
          (await client.query("SELECT count(*)::int AS n FROM public.lessons")).rows[0].n,
          receipt.rowProof.lessons.count + 1,
        );
        assert.equal(
          (await client.query("SELECT count(*)::int AS n FROM public.lesson_revisions")).rows[0].n,
          receipt.rowProof.lesson_revisions.count + 1,
        );
      }
      for (const name of ["lesson_annotations", "lesson_progress", "lesson_media"])
        assert.equal(
          (await client.query(`SELECT count(*)::int AS n FROM public.${name}`)).rows[0].n,
          0,
          "Study fixtures already exist; refuse continuation",
        );
      afterSequences = await sequences(client);
      assert.deepEqual(
        afterSequences["public.question_code_seq"],
        receipt.sequences["public.question_code_seq"],
      );
      assert.deepEqual(afterSequences["drizzle.__drizzle_migrations_id_seq"], {
        last_value: "14",
        is_called: true,
      });
      if (fixturesResume) await assertStudyPrivileges(client, "pg_read_all_settings");
      else
        assert.equal(
          (
            await client.query(
              "SELECT has_table_privilege('pg_read_all_settings','public.lesson_annotations','SELECT') AS allowed",
            )
          ).rows[0].allowed,
          false,
          "Test grants already installed; refuse continuation",
        );
      report.verifiedContinuation = true;
      pass("exactPriorStateVerified");
      pass("migration0014AndExistingDataPreserved");
      await migrate(drizzle(client), { migrationsFolder: staging });
      await assertStudyRuntimeCatalog(client, root, isolated.owner);
      assert.deepEqual(await sequences(client), afterSequences);
      assert.deepEqual(await rowProof(originalStateClient, tables), receipt.rowProof);
      pass("repeatMigratorNoChanges");
    }
    report.backup.restorationVerified = true;
    stage = "restricted-role-and-fixtures";
    writeReceipt();
    const role = (
      await client.query(
        "SELECT rolsuper,rolbypassrls,rolcanlogin,rolcreatedb,rolcreaterole,rolreplication FROM pg_roles WHERE rolname='pg_read_all_settings'",
      )
    ).rows[0];
    assert(role && Object.values(role).every((v) => v === false));
    await client.query("GRANT USAGE ON SCHEMA public TO pg_read_all_settings");
    await client.query(
      "GRANT SELECT ON public.lessons,public.lesson_revisions,public.curriculum_chapters,public.topics,public.exam_domains,public.exam_blueprints TO pg_read_all_settings",
    );
    await client.query(
      "GRANT SELECT,INSERT,UPDATE,DELETE ON public.lesson_annotations TO pg_read_all_settings",
    );
    await client.query(
      "GRANT SELECT,INSERT,UPDATE ON public.lesson_progress TO pg_read_all_settings",
    );
    await client.query("GRANT SELECT,INSERT ON public.lesson_media TO pg_read_all_settings");
    await client.query("GRANT SELECT,INSERT,UPDATE ON public.lessons TO pg_read_all_settings");
    await client.query("GRANT SELECT,INSERT ON public.lesson_revisions TO pg_read_all_settings");
    await assertStudyPrivileges(client, "pg_read_all_settings");
    pass("exactPrivateStudyPrivileges");
    const ownerDb = drizzle(client),
      roleDb = guardedRoleDatabase(client);
    let actor, a, b, blockId, input, lesson, published, revision, immutableBefore;
    if (!fixturesResume) {
      actor = randomUUID();
      a = randomUUID();
      b = randomUUID();
      blockId = randomUUID();
      for (const [id, role] of [
        [actor, "ADMIN"],
        [a, "USER"],
        [b, "USER"],
      ])
        await client.query(
          "INSERT INTO public.users(id,clerk_user_id,email,display_name,role,status) VALUES($1,$2,$3,$4,$5,'ACTIVE')",
          [id, "isolated-study-" + id, id + "@example.invalid", "Isolated study fixture", role],
        );
      const chapter = (
        await client.query(
          "SELECT c.id FROM public.curriculum_chapters c JOIN public.topics t ON t.id=c.id JOIN public.exam_blueprints b ON b.id=c.blueprint_id WHERE t.status='ACTIVE' AND b.status='ACTIVE' ORDER BY c.id LIMIT 1",
        )
      ).rows[0];
      assert(chapter);
      input = {
        chapterId: chapter.id,
        title: "Isolated migration 0014 fixture",
        description: "Disposable verification only",
        objectives: ["Verify private study persistence"],
        estimatedMinutes: 2,
        displayOrder: 999999,
        blocks: [
          {
            id: blockId,
            type: "paragraph",
            text: "TCP provides reliable delivery. UDP provides datagrams.",
          },
        ],
      };
      const created = await services.createLesson(input, actor, ownerDb);
      lesson = created.lesson;

      await rejectService(() => services.lessonStudy(a, lesson.id, roleDb), "LESSON_NOT_FOUND");
      published = await services.publishLesson(lesson.id, lesson.version, actor, true, ownerDb);
      revision = published.lesson.publishedRevisionId;
      assert(revision);
      immutableBefore = (
        await client.query("SELECT snapshot FROM public.lesson_revisions WHERE id=$1", [revision])
      ).rows[0].snapshot;
    } else {
      ({ actor, a, b, blockId, input } = fixtureEvidence);
      lesson = { id: fixtureEvidence.lessonId };
      revision = fixtureEvidence.revisionId;
      published = { lesson: { version: fixtureEvidence.lessonVersion } };
      immutableBefore = (
        await client.query(
          "SELECT snapshot FROM public.lesson_revisions WHERE id=$1 AND lesson_id=$2",
          [revision, lesson.id],
        )
      ).rows[0].snapshot;
      assert.deepEqual(immutableBefore, input);
      report.fixtureProvenanceVerified = true;
    }
    const baseInput = { lessonId: lesson.id, revisionId: revision };
    stage = "study-service-persistence-and-isolation";
    writeReceipt();
    const highlight = (
      await services.createAnnotation(
        a,
        {
          ...baseInput,
          kind: "HIGHLIGHT",
          anchor: { blockId, start: 0, end: 3, quote: "TCP" },
          color: "yellow",
        },
        roleDb,
      )
    ).annotation;
    const note = (
      await services.createAnnotation(
        a,
        { ...baseInput, kind: "NOTE", body: "Original private note" },
        roleDb,
      )
    ).annotation;
    const bookmark = (
      await services.createAnnotation(a, { ...baseInput, kind: "BOOKMARK" }, roleDb)
    ).annotation;
    const note2 = (
      await services.changeAnnotation(
        a,
        note.id,
        { version: note.version, body: "Updated private note" },
        false,
        roleDb,
      )
    ).annotation;
    assert.equal(note2.version, 2);
    assert.equal(note2.body, "Updated private note");
    await rejectService(
      () =>
        services.changeAnnotation(
          b,
          note.id,
          { version: note2.version, body: "Foreign edit" },
          false,
          roleDb,
        ),
      "STUDY_ITEM_NOT_FOUND",
    );
    await rejectService(
      () => services.changeAnnotation(b, note.id, { version: note2.version }, true, roleDb),
      "STUDY_ITEM_NOT_FOUND",
    );
    await rejectService(
      () => services.changeAnnotation(a, note.id, { version: 1, body: "Stale" }, false, roleDb),
      "STUDY_ITEM_CHANGED",
    );
    await rejectService(
      () => services.createAnnotation(a, { ...baseInput, kind: "BOOKMARK" }, roleDb),
      "23505",
    );
    await rejectService(
      () =>
        services.createAnnotation(
          a,
          {
            ...baseInput,
            kind: "HIGHLIGHT",
            anchor: { blockId, start: 1, end: 3, quote: "CP" },
            color: "blue",
          },
          roleDb,
        ),
      "HIGHLIGHT_OVERLAP",
    );
    let progress = (
      await services.saveProgress(a, { ...baseInput, action: "start", version: 0 }, roleDb)
    ).progress;
    progress = (
      await services.saveProgress(
        a,
        { ...baseInput, action: "position", blockId, version: progress.version },
        roleDb,
      )
    ).progress;
    assert.equal(progress.state, "IN_PROGRESS");
    assert.equal(progress.blockId, blockId);
    other = new Client(privateConnection(isolated.database));
    other.on("error", () => {});
    await other.connect();
    await assertPrivateIdentity(other, isolated.database, state.data);
    const reopened = await services.lessonStudy(a, lesson.id, guardedRoleDatabase(other));
    assert.equal(reopened.annotations.length, 3);
    assert(reopened.annotations.some((n) => n.id === highlight.id && n.anchor.quote === "TCP"));
    assert(reopened.annotations.some((n) => n.id === bookmark.id));
    assert(reopened.annotations.some((n) => n.id === note.id && n.body === "Updated private note"));
    assert.deepEqual(reopened.progress, progress);
    const foreign = await services.lessonStudy(b, lesson.id, guardedRoleDatabase(other));
    assert.equal(foreign.annotations.length, 0);
    assert.equal(foreign.progress.state, "NOT_STARTED");
    await other.end();
    other = null;
    pass("notesHighlightsBookmarksAndResumeAcrossConnections");
    progress = (
      await services.saveProgress(
        a,
        { ...baseInput, action: "complete", version: progress.version },
        roleDb,
      )
    ).progress;
    assert.equal(progress.state, "COMPLETED");
    progress = (
      await services.saveProgress(
        a,
        { ...baseInput, action: "position", blockId, version: progress.version },
        roleDb,
      )
    ).progress;
    assert.equal(progress.state, "COMPLETED");
    progress = (
      await services.saveProgress(
        a,
        { ...baseInput, action: "reopen", version: progress.version },
        roleDb,
      )
    ).progress;
    assert.equal(progress.state, "IN_PROGRESS");
    await rejectService(
      () => services.saveProgress(a, { ...baseInput, action: "complete", version: 0 }, roleDb),
      "STUDY_ITEM_CHANGED",
    );
    await services.changeAnnotation(a, note.id, { version: note2.version }, true, roleDb);
    assert.equal(
      (
        await client.query("SELECT count(*)::int AS n FROM public.lesson_annotations WHERE id=$1", [
          note.id,
        ])
      ).rows[0].n,
      0,
    );
    pass("noteEditDeleteAndExplicitProgressTransitions");
    stage = "real-rls-and-constraint-enforcement";
    writeReceipt();
    await expectSql(async () => {
      await client.query("SET LOCAL ROLE pg_read_all_settings");
      assert.equal(
        (await client.query("SELECT count(*)::int AS n FROM public.lesson_annotations")).rows[0].n,
        0,
      );
      await client.query(
        "INSERT INTO public.lesson_annotations(user_id,lesson_id,revision_id,kind,body) VALUES($1,$2,$3,'NOTE','No owner context')",
        [a, lesson.id, revision],
      );
    }, "42501");
    await expectSql(async () => {
      await client.query("SET LOCAL ROLE pg_read_all_settings");
      await client.query("SELECT set_config('app.study_user',$1,true)", [b]);
      assert.equal(
        (await client.query("SELECT count(*)::int AS n FROM public.lesson_annotations")).rows[0].n,
        0,
      );
      await client.query(
        "INSERT INTO public.lesson_annotations(user_id,lesson_id,revision_id,kind,body) VALUES($1,$2,$3,'NOTE','Spoofed owner')",
        [a, lesson.id, revision],
      );
    }, "42501");
    await expectSql(async () => {
      await client.query("SET LOCAL ROLE pg_read_all_settings");
      await client.query("DELETE FROM public.lesson_progress");
    }, "42501");
    await expectSql(async () => {
      await client.query("SET LOCAL ROLE pg_read_all_settings");
      await client.query("UPDATE public.lesson_revisions SET snapshot=snapshot");
    }, "42501");
    await expectSql(
      () =>
        client.query(
          "INSERT INTO public.lesson_annotations(user_id,lesson_id,revision_id,kind,body) VALUES($1,$2,$3,'NOTE','FK probe')",
          [randomUUID(), lesson.id, revision],
        ),
      "23503",
    );
    await expectSql(
      () =>
        client.query(
          "INSERT INTO public.lesson_annotations(user_id,lesson_id,revision_id,kind,body) VALUES($1,$2,$3,'NOTE','Pair probe')",
          [a, randomUUID(), revision],
        ),
      "23503",
    );
    for (const kind of ["INVALID", "NOTE"])
      await expectSql(
        () =>
          client.query(
            "INSERT INTO public.lesson_annotations(user_id,lesson_id,revision_id,kind,body) VALUES($1,$2,$3,$4,$5)",
            [a, lesson.id, revision, kind, ""],
          ),
        "23514",
      );
    await expectSql(
      () =>
        client.query(
          "INSERT INTO public.lesson_progress(user_id,lesson_id,revision_id,state,version) VALUES($1,$2,$3,'IN_PROGRESS',0)",
          [b, lesson.id, revision],
        ),
      "23514",
    );
    await expectSql(() => client.query("DELETE FROM public.users WHERE id=$1", [a]), "23001");
    await expectSql(
      () =>
        client.query("UPDATE public.lesson_revisions SET snapshot=snapshot WHERE id=$1", [
          revision,
        ]),
      "23001",
    );
    await expectSql(
      () =>
        client.query(
          "INSERT INTO public.lesson_media(created_by,storage_key,mime,bytes,sha256) VALUES($1,'../bad.png','image/png',1,$2)",
          [actor, "a".repeat(64)],
        ),
      "23514",
    );
    pass("realRlsForeignKeysChecksRestrictAndHistoryGuards");
    stage = "published-revision-compatibility";
    writeReceipt();
    const draft = await services.updateLesson(
      lesson.id,
      { ...input, title: "Second isolated revision" },
      published.lesson.version,
      actor,
      ownerDb,
    );
    const next = await services.publishLesson(
      lesson.id,
      draft.lesson.version,
      actor,
      true,
      ownerDb,
    );
    assert.notEqual(next.lesson.publishedRevisionId, revision);
    assert.deepEqual(
      (await client.query("SELECT snapshot FROM public.lesson_revisions WHERE id=$1", [revision]))
        .rows[0].snapshot,
      immutableBefore,
    );
    await rejectService(
      () =>
        services.createAnnotation(a, { ...baseInput, kind: "NOTE", body: "Old revision" }, roleDb),
      "STUDY_REVISION_CHANGED",
    );
    const workspace = await services.studyWorkspace(a, {}, roleDb);
    assert(workspace.items.some((n) => n.id === highlight.id && n.revisionId === revision));
    const fresh = await services.lessonStudy(a, lesson.id, roleDb);
    assert.equal(fresh.revisionId, next.lesson.publishedRevisionId);
    assert.equal(fresh.progress.state, "NOT_STARTED");
    const realPublished = (
      await client.query(
        "SELECT id FROM public.lessons WHERE published_revision_id IS NOT NULL AND id<>$1 ORDER BY id",
        [lesson.id],
      )
    ).rows;
    for (const row of realPublished)
      requireThat(
        (await services.publishedLesson(row.id, roleDb)).lesson,
        "Restored published lesson missing",
      );
    pass("publishedRevisionCompatibilityAndOldAnnotationRetention", {
      restoredPublishedLessonsRead: realPublished.length,
    });
    stage = "final-original-data-and-sequences";
    writeReceipt();
    const fixtureRevisions = (
      await client.query("SELECT id FROM public.lesson_revisions WHERE lesson_id=$1", [lesson.id])
    ).rows.map((r) => r.id);
    const excluded = {
      users: [actor, a, b],
      lessons: [lesson.id],
      lesson_revisions: fixtureRevisions,
    };
    const originalRows = {
      query: (q, p) => {
        const match = typeof q === "string" ? q.match(/FROM public\."([a-z_]+)" t$/) : null;
        return match && excluded[match[1]]
          ? client.query(q + " WHERE t.id<>ALL($1::uuid[])", [excluded[match[1]]])
          : client.query(q, p);
      },
    };
    assert.deepEqual(await rowProof(originalRows, tables), receipt.rowProof);
    assert.deepEqual(await sequences(client), afterSequences);
    await assertStudyRuntimeCatalog(client, root, isolated.owner);
    await assertStudyPrivileges(client, "pg_read_all_settings");
    assert.equal(
      createHash("sha256").update(readFileSync(receipt.backup.path)).digest("hex"),
      backupHash,
    );
    report.originalRecordsPreserved = true;
    report.questionCodeSequencePreserved = true;
    report.fixtureRowsRetained = true;
    report.mainStartupGuardsChanged = false;
    report.testSqlRole = "pg_read_all_settings (existing NOLOGIN role; new-database grants only)";
    pass("finalOriginalDataAndSequencePreservation");
  });
  report.hbaRestoredByteForByte = true;
  stage = "complete";
  report.completed = true;
  report.backup.rehearsalVerified = true;
  writeReceipt();
  console.log(JSON.stringify({ ...report, outcomes, report: path.join(folder, "rehearsal.json") }));
} catch (error) {
  report.completed = false;
  report.failure = {
    sqlState:
      typeof code(error) === "string" && /^[A-Z0-9]{5}$/.test(code(error)) ? code(error) : null,
    invariant:
      error?.name === "AssertionError"
        ? String(error.message).split("\n")[0].slice(0, 160)
        : "Operation stopped; raw output, credentials and row values withheld.",
  };
  writeReceipt();
  console.log(
    JSON.stringify({
      stage,
      completed: false,
      failure: report.failure,
      report: folder ? path.join(folder, "rehearsal.json") : null,
      applicationDatabaseConnections: 0,
      applicationWrites: 0,
    }),
  );
  process.exitCode = 1;
} finally {
  if (other) await other.end().catch(() => {});
  if (client) await client.end().catch(() => {});
}
