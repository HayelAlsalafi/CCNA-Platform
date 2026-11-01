# Phase 2A.1 — lesson saving and activation

## Confirmed live failure

On 27 October 2026, unauthenticated diagnostic requests returned:

| Target | Method/path | Actual result |
| --- | --- | --- |
| `127.0.0.1:3000` | GET `/api/admin/lessons` | 404, `text/html`, Express `Cannot GET /api/admin/lessons` |
| `127.0.0.1:3000` | POST `/api/admin/lessons` with empty JSON and no credentials | 404, `text/html`, Express `Cannot POST /api/admin/lessons` |
| `127.0.0.1:8080` | Same GET and POST | Identical Express HTML 404 responses |

These are **unmatched routes in the running API**, not a lesson readiness error.
A correctly loaded lesson route responds with JSON 401 before database access
for these unauthenticated requests. An authenticated authorized request with
missing lesson tables responds with JSON 503 `LESSONS_NOT_READY`.

The current source already registers the route correctly:

1. The editor uses `lessonRequest()` and POST `/api/admin/lessons` for creation;
   existing drafts use PUT `/api/admin/lessons/:id` with an optimistic version.
2. `customFetch` applies the existing Clerk token getter and JSON content type.
   Admin mutations carry the captured `X-Admin-Session` precondition.
3. The guarded Vite runtime in `tools/phase6a-local/run.mjs` forwards `/api`
   unchanged to `http://127.0.0.1:3000`. Its config is inline (`configFile:false`),
   so it does not use the artifact Vite config in this workflow. That artifact
   config also retains the `/api` prefix for ordinary pnpm development.
4. `artifacts/api-server/src/app.ts` mounts `routes/index.ts` at `/api`.
5. The registry imports and mounts `lessonsRouter`; the lesson router registers
   POST `/admin/lessons` after authenticated-user/Admin/session checks.
6. The service validates content, checks schema readiness and chapter references,
   then inserts the draft transactionally. Nothing publishes automatically.

Read-only listener inspection identified API PID **41068**, listening only on
`127.0.0.1:3000`, started **2026-10-27 08:47:33.821 UTC**. The web runtime was PID
**43588**, `127.0.0.1:8080`, started **08:48:35.374 UTC**. Both were the guarded
Node launchers. The route registry's last write was **09:34:58 UTC**, after API
startup. The launcher imports the TypeScript app once through TSX; it does not
watch/reload backend modules. The live API is therefore serving its earlier
route inventory. Restarting that API is necessary. No proxy rewrite or duplicate
backend route was added to work around the stale process.

No authenticated browser request was captured, no credentials were obtained and
no database was connected to during diagnosis. The probes encountered unmatched
routes and did not create records. Live Admin authorization, catalog readiness
and successful persistence remain **NOT VERIFIED**.

## Additional source defects corrected

- `lessonError()` previously interpreted every 404 as a missing/unpublished
  learner lesson, including HTML route misses during Admin saves. It now accepts
  an Admin context: an unavailable management endpoint recommends restarting
  the current API; `LESSON_NOT_FOUND` identifies a missing draft. The reader
  retains its published-lesson 404 message.
- Only a 503 carrying `LESSONS_NOT_READY` is identified as the migration gate.
  A different 503 is reported as API unavailability rather than guessed schema
  absence.
- A synchronous ref now blocks same-tick duplicate form submissions. React's
  asynchronously updated busy state remains responsible for disabled controls.
  The Save button shows `Saving lesson…`, and existing success/error messages
  reflect the actual request outcome.
- The editor stays mounted after the first successful POST. Previously changing
  its parent key from `new` to the saved UUID remounted it and discarded the
  immediate success feedback. It now retains its saved identity for subsequent
  PUTs, local form state and success status.
- Failed requests leave the form text intact. Preview renders that unsaved form
  directly with `LessonContent`; it makes no published-lesson request and never
  requires publication. No localStorage persistence was added.

Published content still comes from immutable revisions. Save draft updates only
the working copy; publish/unpublish retain their existing version and transaction
checks. The database migration, API authorization and publication SQL were not
changed in this task.

## Files changed

- `artifacts/ccna-learning/src/components/admin-lessons.tsx`
- `artifacts/ccna-learning/src/pages/lesson-reader.tsx`
- `artifacts/ccna-learning/src/components/lessons.test.tsx`
- `artifacts/api-server/src/routes/lessons.test.ts`
- This report.

The API tests now mount the **actual route registry** from `routes/index.ts`,
instead of mounting only the lesson router. No source registration fix was
necessary. Existing uncommitted work was preserved.

## Verification results

| Check | Actual result |
| --- | --- |
| `node tools/run-curriculum-tests.mjs --lessons` | PASS: **173 tests**, 10 files, zero failures |
| `node tools/check-admin.mjs` | PASS: API, frontend, schema and API-client TypeScript |
| `node tools/build-admin-ui.mjs` | PASS: 1,961 modules; `.local/admin-ui-production-build/1793109789404` |
| Live direct/proxy route probes | Confirmed the four HTML 404 responses above |
| Live authenticated save / PostgreSQL persistence | NOT VERIFIED |
| Migration / backup / restoration / grants | NOT EXECUTED |

Focused coverage includes new draft creation via POST, subsequent PUT to the same
saved ID, correct session/JSON headers, pending button state, same-tick duplicate
blocking, retained content after HTML 404, unpublished preview without network
access, missing route versus missing draft versus readiness errors, publication,
learner restrictions, stale versions, response validation and current root-router
registration. Database services remain mocked. The suite also retains curriculum,
practice-link, cache-isolation and application-shell regression checks.

The existing build sourcemap and large-chunk warnings remain. One test launch
encountered sandbox access restrictions before collection; the permitted rerun
passed. No unrelated pre-existing failing tests were run or investigated.

## Migration readiness — source review only

Proposal: `lib/db/drizzle/proposed/0013_learning_lessons.sql`.
Raw SHA-256:
`e85ace211e7feb28183c3f9a9e7822bd437b060c81717be2aeb4739df0d394a3`.

The official source journal currently contains 0000–0011 only. Proposal 0013
references existing `curriculum_chapters` and `users`; it does not depend on exam
tables in proposal 0012 semantically. Ordered Drizzle promotion still needs an
explicit reviewed decision about 0012. Do not silently apply that separate exam
feature, skip migration ordering or edit historical ledger rows.

The lesson proposal is additive: it creates `lessons`, `lesson_revisions`, their
indexes and the immutable-revision trigger/function. It changes no existing
question, topic, learner, chapter or history rows. RESTRICT FKs retain chapter
and author references. The composite publication FK binds a revision to its own
lesson. Unique revision numbers and row locking support concurrent publishing.
Revision UPDATE/DELETE is rejected by the proposed trigger. These checks match
the Drizzle model and pass static tests; PostgreSQL execution is **not verified**.

The expected local target from the guarded policy is:

- `127.0.0.1:5432`, database `ccna_phase6a_dev`.
- System identifier `7694701597474139084`.
- Migrator/expected new-object owner: `ccna_phase6a_migrator`.
- Runtime role: `ccna_phase6a_app`.

Required narrowly scoped runtime privileges after approved activation:

| Object | Runtime privileges |
| --- | --- |
| Schema `public` | Existing USAGE; verify it remains present |
| `public.lessons` | SELECT, INSERT, UPDATE |
| `public.lesson_revisions` | SELECT, INSERT |

There are no new sequences: IDs use UUID defaults and revision numbers are
assigned under a locked parent row. No direct DELETE, TRUNCATE, revision UPDATE,
ownership, role-membership or unrestricted function grants are needed. The
trigger function has PUBLIC privileges revoked in the proposal. No grants were
executed. Existing chapter/user privileges remain subject to the guarded policy.

## Exact next steps for real saving

### 1. Load the current backend without changing the database

Keep unsaved lesson content open or copy it to a local document before refreshing
the web page. In the **existing API terminal**, use Ctrl+C to stop its own guarded
process. Do not kill arbitrary Node processes. Then run:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
```

Enter the existing app and migrator passwords and Clerk development keys only at
the launcher's hidden prompts. The migrator prompt supports the existing
SELECT-only ledger guard; the API still runs as `ccna_phase6a_app`. Do not rerun
cleanup scripts or migrations.

The web process may remain running because its proxy target is unchanged. If it
is stopped, launch it in a second terminal:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

Check the route anonymously without attempting a save:

```powershell
curl.exe -i -H "Accept: application/json" http://127.0.0.1:3000/api/admin/lessons
curl.exe -i -H "Accept: application/json" http://localhost:8080/api/admin/lessons
```

Expected current-source result: JSON **401 UNAUTHENTICATED**, not HTML 404. In the
signed-in Admin UI, GET `/api/admin/lessons` should then reach authorization and
the service; if the schema is absent it must return JSON **503 LESSONS_NOT_READY**.
Neither result demonstrates a successful save.

### 2. Obtain current readiness evidence before approving activation

This optional manual check is SELECT-only and uses a hidden password prompt:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' --host=127.0.0.1 --port=5432 --username=ccna_phase6a_migrator --dbname=ccna_phase6a_dev --password --no-psqlrc --set=ON_ERROR_STOP=1 --command "BEGIN READ ONLY; SELECT local_runtime_guard.identity() AS identity; SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id; SELECT v.name,to_regclass(v.name) AS relation,pg_get_userbyid(c.relowner) AS owner FROM (VALUES ('public.lessons'),('public.lesson_revisions')) v(name) LEFT JOIN pg_class c ON c.oid=to_regclass(v.name); ROLLBACK;"
```

Do not send passwords or tokens in chat. Verify the exact identity before any
future write. This report does not assume the live schema or privileges from the
proposal's existence alone.

### 3. Separately approved activation procedure — NOT executed

1. Pin the exact server identity, current ledger hashes/timestamps, migration
   source hashes, ownership and chapter/user schema. Resolve the 0012/0013 source
   promotion sequence and produce consistent journal/snapshot metadata.
2. Create a full custom-format PostgreSQL backup with the known migrator account
   and hidden prompt. Record size and SHA-256, verify its TOC and full archive
   decode, and restore into an explicitly approved isolated database. Verify
   restored row fingerprints and sequences, not just process exit status.
3. Rehearse the proposed ordered chain through the actual Drizzle migrator in an
   authorized isolated target. Test repeat execution, FKs, wrong-lesson publication,
   immutable revisions, concurrent version conflicts, draft hiding and recovery.
   No new environment or existing populated rehearsal database may be reset or
   reused without separate authorization.
4. Prepare the guarded application rollout, including source/journal hashes,
   exact table inventory, runtime privilege checks and the least-privilege grants
   above. Existing launcher protections must accept the new objects deliberately;
   applying SQL alone could make the next runtime preflight fail.
5. Present the reviewed backup, target, exact changes, rehearsal results and
   recovery procedure for explicit activation approval. No application migration
   command is ready or authorized in this task.
6. After approval, apply through the official migrator, verify ledger/schema/
   privileges and unchanged existing data, then restart the API. Test one approved
   draft creation, reload it from PostgreSQL, edit the same ID, preview without
   publication and verify versioned publishing and learner access restrictions.

Before a migration transaction commits, a failure should roll it back. After
publication, recover content by unpublishing or publishing a corrected revision;
do not delete immutable history or drop the new tables to simulate rollback.
Full database restoration requires a separately reviewed recovery operation.

Until activation, persistent draft creation/editing, publication and published
lesson reading cannot function against the intended database. Local unsaved
preview and existing curriculum/practice remain available. No end-to-end save
success is claimed, and no services were stopped/restarted by this task.
