# Phase 6A: immutable question revisions and historical grading

Validated locally on 2026-10-11. Base commit: `4dea4d361723e35139b9bba40d31954e65bbc1a2`.
This milestone extends Draft PR #12 locally. No push, merge, production migration,
Neon connection, or production data import was performed.

## Architecture and migration impact

Previously, grading read mutable question options. An admin edit between delivery
and submission could change the answer key, and history could not reconstruct the
original question. The new model keeps the existing editable catalog and adds:

- `question_revisions`: content-addressed, immutable JSON snapshots of question
  code, question text/type/difficulty, ordered options including the answer key,
  explanation, image key, references, and topic ID/name/slug. PostgreSQL canonical
  JSON determines the SHA-256 hash; a unique question/hash pair deduplicates content.
- `practice_deliveries`: server-issued UUIDs binding a question/revision to the
  authenticated internal user and verified Clerk session, valid for 24 hours.
- Nullable `revision_id` and `delivery_id` on existing attempts. New attempts must
  bind both. Existing legacy attempts remain NULL and retain their exact scores.

Admin create/edit/disable captures observed content transactionally. Practice reads
also capture current legacy catalog content, without attaching inferred snapshots
or new scores to old attempts. Admin option replacement takes the parent question
lock first; delivery holds a compatible shared parent lock and reads options/topic
consistently. Concurrent editors serialize and each complete content version is
captured. The existing last-writer-wins edit policy is retained; this is not an
optimistic editor conflict-resolution feature.

Submission reads only the delivered snapshot's key. A transaction advisory lock
and unique delivery constraint permit one accepted attempt. Same-answer retries
return persisted correctness and immutable feedback, including after expiry or
catalog disable. Conflicting retries return 409. An expired unsubmitted delivery
returns 409; invalid options return 400. Wrong actor/session/question bindings and
unavailable current content return 404 without revealing feedback. Current and
original topics must still be ACTIVE for the first accepted write. Moving a
question does not move its previously delivered or attempted topic.

History with `includeDetails=true` returns the owner's exact captured text,
options, explanation, references and grading context. Legacy history explicitly
uses `LEGACY_UNAVAILABLE`, null review/revision, and labels current catalog display
names as such. No original legacy content is invented. The plain history response
and progress aggregates preserve their existing shape and recorded results.

`0004_question_revisions.sql` is forward-only and additive. Composite foreign keys
bind delivery/user/question/revision; unique indexes prevent duplicate submissions.
Snapshot shape/key/hash, expiry and insert-grade checks are database-enforced.
UPDATE/DELETE and TRUNCATE triggers make revisions, deliveries and attempts
append-only. Runtime has SELECT/INSERT on the new tables, no UPDATE/DELETE. Required
lookup indexes and validated constraints were inspected in the real database.
TRUNCATE triggers were inspected, never executed against application relations.

## Backup and local application

Only `127.0.0.1:5432/ccna_phase6a_dev` on the installed PostgreSQL 18 cluster was used.
The service executable/data directory, cluster fingerprint, exact database and
restricted migration/application roles were verified before writes. Port 55433
and external database hosts were not used. Credentials were entered in private,
hidden local prompts and supplied in memory, never committed or logged.

Before migration, `pg_dump` created a custom-format application-schema/data and
Drizzle-ledger archive under ignored `.local/tests/phase6a5/pre-revisions.dump`.
SHA-256: `fa0ecff118e853d3d0f376af6ca09e697ca498fdfcf521e690fd4a3e941e8fd1`.
The archive was listed and actually restored to unique scratch schemas inside a
transaction that was rolled back. It is an application backup, not a cluster/role
backup: recovery requires the separately prepared local roles and runtime guard.
Do not share or commit the archive; it contains local user data.

Drizzle `migrate` applied the reviewed versioned migration. No `drizzle push`,
legacy backfill, attempt rewrite or role/status change occurred. Both pre-existing
attempts were checked against their pre-migration hashes; all original fields and
scores remained unchanged and their revision/delivery columns remain NULL.
Only SELECT/INSERT grants for the new tables were added to the existing restricted
runtime role. Local fixture catalogs were soft-disabled; append-only test attempts
and snapshots intentionally remain. A few empty diagnostic fixture topics may
remain; no existing user content is deleted.

Both frontend and API run from the Phase 6A worktree on their existing local URLs.
The protected old launcher files were not changed; reviewed ignored launcher
copies recognize the fifth migration/seven tables. Its Windows command-line guard
was corrected for quoted/unquoted paths and path separators. Failed frontend
refresh attempts stopped safely before the final successful startup.

## API, client and authorization compatibility

The practice delivery response adds `deliveryId`, `revisionId`, `expiresAt`.
Answer POST now requires `deliveryId`; old clients with only `optionKey` get
409 `DELIVERY_REQUIRED` and must upgrade/reload. This deliberate fail-closed API
change avoids unsafe fallback grading. Deploy the migration, runtime grants and
matching API/frontend together; the old API cannot insert unbound new attempts.
The read-only `/questions/:id` catalog view does not issue a gradable delivery.

OpenAPI and main/detailed-history generated clients/types/Zod were regenerated.
The main Orval transformer preserves dedicated Progress/History export ownership
and the plain-history allow-list. Generation cleaning/automatic formatting is
avoided to preserve dedicated outputs and unrelated files. Existing admin session
header validators were regenerated inline with the same validation semantics.
No lockfile/dependency changes were needed.

Frontend submits the exact delivery, clears selection for new deliveries even
when text is identical, rejects stale result attachment, and offers a fresh draw
on 409 without silently retrying another answer. Focus/reconnect refetch is disabled
for active delivery queries. Existing Clerk identity cache boundaries remain.

Clerk authentication and PostgreSQL role/status resolution remain authoritative
and unchanged. No client user ID, role, revision key or session signal authorizes
writes. Existing `X-Admin-Session` remains a verified-session consistency signal;
headerless admin clients retain their previously documented weaker intent check.
A request already dispatched under verified identity may legitimately complete
after browser switching. Server persistence is not claimed to be canceled.

## Validation evidence

Exact commands (private runners remove inherited external DB/Clerk variables for
ordinary checks and use the existing native Windows esbuild):

| Check | Command | Result |
| --- | --- | --- |
| Non-database API | `pnpm --filter @workspace/api-server exec vitest run --exclude "**/*.db.test.ts"` | 219 passed, 0 failed, 11 files |
| Frontend | `pnpm --filter @workspace/ccna-learning test` | 133 passed, 0 failed, 9 files |
| Actual local PostgreSQL | `pnpm --filter @workspace/api-server exec vitest run src/lib/question-revisions.db.test.ts --reporter=verbose` | 21 passed, 0 failed, 1 file |
| Workspace TypeScript | `pnpm run typecheck` | passed |
| Orval TypeScript | `pnpm exec tsc -p lib/api-spec/tsconfig.codegen.json` | passed |
| API production build | `pnpm --filter @workspace/api-server run build` | passed |
| Frontend production build | `pnpm --filter @workspace/ccna-learning run build` with `PORT=8080`, `BASE_PATH=/` and verified `VITE_CLERK_PUBLISHABLE_KEY` in memory | passed; authenticated revision UI included; tooltip sourcemap and >500 kB chunk warnings |
| Main generation | `pnpm --filter @workspace/api-spec run codegen` | passed |
| Detailed-history generation | `pnpm --filter @workspace/api-spec exec orval --config ./orval.practice-history.config.ts` | passed |

The configured build was executed by ignored `node .local/tests/phase6a5/configured-build.mjs`. It read only the development publishable key already served to the local browser, checked the expected development instance, retained it in memory, and asserted the final bundle contains both historical review and delivery-conflict UI. A build without a configured Clerk key can tree-shake the authenticated application and is insufficient evidence for that UI. Neither environment files nor secret keys were used for this build.

The PostgreSQL suite requires explicit `RUN_REVISION_DB_TESTS=1` and hidden local
role credentials; it hardcodes the approved local host/database and verifies the
cluster identity before writes. `REVISION_DB_CLUSTER_ID` can specify an explicitly
verified replacement LOCAL cluster fingerprint, never an external host.
The optional legacy hash assertion reads a local ignored backup receipt
(`REVISION_LEGACY_BASELINE` override); it is skipped when no receipt exists. All
21 cases ran here, including both legacy hashes. Service tests use disposable
synthetic actor/session IDs and do not constitute tests of Clerk token verification.
Older database fixture suites were adapted to the new binding or temporary legacy
fixtures; they were not rerun against this database because their TEMP privilege/
transaction assumptions differ from the restricted runtime. Do not enable the
older broad DB runner against an external database.

Real persistence cases cover old-key late submission, historical content after
edits/rename, concurrent matching/conflicting retries, wrong actor/session/question,
expiry/disable, topic moves, concurrent delivery/admin edits, two concurrent
administrators, append-only triggers, direct invalid inserts, hash/shape validation,
foreign keys, indexes/privileges, progress, owner isolation, unchanged legacy rows,
and already-dispatched request context. Frontend tests add exact delivery payload,
identical-content replacement cleanup, 409 recovery, immutable historical rendering
and explicit legacy unavailability.

Initial real DB run had all 19 then-current assertions pass but failed teardown
because an array was incorrectly bound in cleanup SQL. It was corrected and the
full 21-case suite passed. A new unit mock represented jsonb as a string; fixing
that fixture yielded the final 219/219 API pass. Neither failed run is counted as
a successful suite.

User-assisted real Clerk/cookie browser API smoke at 2026-10-11T06:35:32Z:
12 passed, 0 failed. It verified real ADMIN/unauthenticated 401, disposable catalog
CRUD, safe delivery, editing the answer key after delivery, old-key late grading,
new-key grading, concurrent duplicate retries, conflicting/missing delivery 409,
exact historical review after edits, progress increments, disable rejection and
accepted replay, and retained history after soft-disable. Expected 401/409/404
Console entries were negative checks, not regressions. Two disposable attempts
persisted; its question/topic were disabled. This evidence is user-reported from
the reviewed local helper, not autonomous browser automation. Loopback startup
checks verify API health, frontend, proxy health, protected unauthenticated access
and SPA document delivery; an HTTP 200 SPA shell alone is not feature validation.

## Known limitations, acceptance and rollback

- Real different USER-account HTTP 403 and live Clerk session transitions remain
  BLOCKED/Not Verified; mocked authorization/response-isolation checks are separate.
- The previously delayed learner Clerk Submit scenario remains **Not Verified**.
  The old-revision late grading check above uses a stable real Clerk session and
  does not verify switching sessions while a browser request is delayed.
- Direct browser API calls do not verify new history UI interaction or all manager
  cache callbacks; focused frontend tests cover rendering/state behavior.
- Legacy original question content cannot be recovered from absent snapshots.
  Stored scores are retained without recalculation or inferred historical keys.
- Image keys/reference strings are captured, not immutable copies of external image
  bytes or reference websites. Future media edits require a versioned asset policy.
- Expired/unsubmitted deliveries are retained. Production needs an explicit safe
  retention/rate/volume policy and migration/grant/deployment validation. Long lock
  waits/deadlocks and the exact expiry boundary may surface generic failures; the
  database still prevents incorrect writes. Production operational tuning is pending.
- Concurrent admin forms remain last-writer-wins. Captured revisions are complete;
  optimistic edit warnings, revision browsing and revision audit actors are future work.
- The unchanged protected launcher inventory still describes four migrations; its
  ignored runtime copies are a local solution, not a production deployment procedure.

Core integrity acceptance is met by real persistence and authenticated local API
checks: delivered keys and historical scores are stable, retries create no extra
attempt, owner/session boundaries are maintained, and legacy rows are untouched.
Phase 6A/PR #12 is not ready to merge until outstanding Clerk/browser and operational
validation is addressed. This local commit has no new GitHub CI run until an
explicitly approved push; older Draft PR CI is not evidence for this new HEAD.

Rollback preference is forward repair. Do not remove snapshots, recalculate scores,
or run old grading code against the migrated schema. If recovery is necessary,
stop the local app and, with a separately reviewed restore action, restore the
verified archive to a new isolated local recovery database using prepared roles/
guards. Confirm row hashes before switching. Restoring a live database would lose
post-backup attempts and is not an automatic rollback. No down migration was run.

Original checkout branch/HEAD/index and all 53 protected changes are checked against
its baseline; all 15 pre-existing uncommitted worktree documents/local scripts are
preserved byte-for-byte and excluded from this commit. Ignored prompts, credentials,
backups, receipts and runtime copies are excluded. No production or Neon operations.
