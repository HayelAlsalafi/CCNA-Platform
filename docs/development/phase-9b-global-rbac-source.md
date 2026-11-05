# Phase 9B — GLOBAL RBAC source package

Prepared against `main` / `e537fa6081b2d4b77204bfa9137eb2c1a6dcae1c`. The owner explicitly selected GLOBAL-only implementation. This source-work authorization supersedes the earlier “not started” status for this limited scope; it does not authorize database activation. [Phase 9A data preservation rules](../architecture/phase-9a-owner-approval-record.md) remain binding.

**GLOBAL role administration source: prepared. COURSE: disabled. Database/runtime/visual verification: NOT PERFORMED. Activation: NO-GO.**

## Source behavior

- Code-defined roles: OWNER, ADMIN, CONTENT_MANAGER, STUDENT. New privileged operations require an explicit active GLOBAL assignment; legacy USER/ADMIN is not translated into an assignment or ownership.
- OWNER can grant/revoke any other user's GLOBAL role. ADMIN can manage only CONTENT_MANAGER/STUDENT, and cannot demote/revoke an existing OWNER/ADMIN. Self role changes are denied, including self revocation. No user-disable, profile edit, user deletion or bulk mutation endpoint was added.
- New routes under `/api/admin/rbac`: GET `/me`, GET `/users?page=1`, GET `/audit?page=1`, POST `/assignments`. Reads are bounded to 20 items/page, at most page 10000, with no-store. No email, Clerk identifiers, raw learner answers or private lesson records are returned. Audit events contain actor/target IDs, action, before/after role state, reason and timestamp.
- Identity comes from the existing verified Clerk/session → local ACTIVE user middleware. No token role claims authorize these operations. Mutation requests additionally require the verified `X-Admin-Session` precondition. Request bodies cannot supply an actor or arbitrary course UUID.
- The API derives actor ID, validates input and checks explicit assignment. The database mutation function independently rechecks actor/target status, authority, expected version, delegation ceiling and last active Owner before recording the change and audit in one atomic statement/transaction.
- Every authority operation updates one guard row, rather than merely selecting it for update. This serializes changes and causes stale repeatable-read writers to fail instead of counting an outdated Owner set. A proposed user-status trigger participates in the same guard and prevents disabling the last active Owner. Direct status updates can deadlock with authority operations; PostgreSQL must abort one transaction, and the API reports conflict without automatic retry.
- Successful role changes have a unique request ID and canonical request digest. Identical authorized retries return the recorded result; changed parameters conflict. Audit insertion failure aborts the assignment change. Audit UPDATE/DELETE/TRUNCATE are rejected; revocation retains the assignment row/version and audit.
- `/admin/users` provides a minimal bilingual user/assignment view, explicit confirmation/reason, bounded pagination and audit history. A link is present on the existing Admin overview. The route independently authorizes new GLOBAL roles, so an explicitly bootstrapped Owner with legacy USER can use the direct URL; the legacy sidebar is unchanged.
- UI mutation locking prevents duplicate clicks. Unconfirmed outcomes block another submission until the user leaves the dialog and reloads/reviews state. Query data is partitioned by Clerk user/session and included in existing Admin cache cleanup.

The permission map declares content capabilities, but **this pass does not replace existing content-route `requireAdmin` gates or controlled-deletion functions**. A new CONTENT_MANAGER assignment alone does not open the legacy Lesson/Question Studio APIs. OWNER/ADMIN assignments likewise do not implicitly change `users.role`. This is deliberate compatibility isolation; integrating those declared content capabilities with legacy content/publishing/deletion gates needs a separate scoped review. No entitlement/access-policy behavior is implemented.

## Prepared migration — not registered or applied

Proposal: `lib/db/drizzle/proposed/0018_global_rbac.sql`.

SHA-256: `731fba01c9fc64fd29ded7e9b6be241f2a820faf8421b4f4f45224e3098f1ac9`.

New tables: `global_rbac_guard`, `global_role_assignments`, `admin_audit_events`. Proposed Drizzle definitions are in `lib/db/src/schema/global-rbac.ts`. Existing USER/ADMIN enum/default, historical SQL, official migration journal, snapshots, ledger and pinned startup guards remain unchanged. No course/track/version table or incoming lesson FK is added.

The SQL seeds only its new singleton guard record. Assignments/audit start empty. It does not seed Owner, promote existing Admins, change a current user's role/status, update existing content, modify existing RLS or alter revision/deletion functions.

Proposed functions:

- `global_rbac_context(uuid)` and `global_rbac_read(uuid,text,integer)`: SECURITY DEFINER, fixed `search_path=pg_catalog`, bounded presentation reads. Only these read functions receive application-role EXECUTE.
- `global_rbac_change(uuid,uuid,text,integer,uuid,text)`: SECURITY DEFINER, safe search path/time limits; EXECUTE only for the separately provisioned `ccna_rbac_manager` LOGIN. No fallback to app/migrator credentials exists in the API.
- `global_rbac_bootstrap(uuid,text,text,uuid)`: owner-only, not granted to app/manager. Exact target confirmation and approval reference required; first bootstrap requires empty assignment/audit tables and an ACTIVE target. Repetition is rejected; uncertain outcomes require read-only diagnosis.
- Immutable audit and last-Owner status trigger functions; no public/runtime direct EXECUTE grant on these triggers.

All new tables are owner-only: no direct application/manager SELECT/INSERT/UPDATE/DELETE, and no broad grants to the existing users/content/history tables. PUBLIC function execution is revoked. Existing study RLS stays unchanged; no learner impersonation or lesson monitoring bypass is introduced. Definer ownership, function bodies, ACL/default ACL, memberships and privileges must be verified exactly in rehearsal and activation.

The SQL requires `ccna_phase6a_migrator` and an already reviewed dedicated manager LOGIN with no superuser/create-role/create-db/replication/inheritance/BYPASSRLS/membership powers, no public-schema creation, no database CREATE/TEMP and no existing table/column/sequence authority. It does not provision a role or credential. New read/management definer functions rely on the trusted API to supply the verified actor UUID; the database does not independently validate a Clerk signature.

## Explicit Owner bootstrap design

1. Obtain separate approval identifying one exact existing ACTIVE user's database UUID and known Clerk identity through an authorized read-only check. No target has been selected in this source task; no account is automatically eligible merely because it is legacy ADMIN.
2. Approve the exact migration, dedicated manager role/grants, operator identity, backup/restore proof and bootstrap approval reference. Assign a distinct bootstrap request UUID.
3. The future reviewed executor must verify the exact cluster/baseline, installed RBAC body/ownership/ACL, empty assignments/audit, target identity/status and expected maintenance state before invoking the owner-only bootstrap function in a transaction. Confirmation must be exactly `BOOTSTRAP GLOBAL OWNER <approved-user-uuid>`.
4. Verify one active Owner and its `OWNER_BOOTSTRAP` audit record before commit and in a separate read-only transaction afterwards. Retain sanitized evidence. Keep manager/app unable to execute bootstrap.
5. Never repeat after an uncertain commit. No self-service bootstrap API, default-owner env variable or automatic legacy promotion exists. A later recovery of zero Owners requires a separate approval/procedure, not reuse of the one-time bootstrap.

This document supplies a design, not a main bootstrap command or permission to invoke it.

## Configuration and trust boundaries

`RBAC_ENABLED` must be exactly `true` before the new service reads RBAC functions; absent/other values fail closed with `RBAC_NOT_READY`. Default application behavior remains inactive. `RBAC_MANAGEMENT_DATABASE_URL` is a future server-only secret for the dedicated manager LOGIN; it is never sent to the frontend or printed. This source pass did not read or set its value. The lazy manager pool accepts only the reviewed local endpoint/database/role, rejects URL options, and never falls back to the application or migrator connection.

The dedicated LOGIN limits what a stolen **application DB credential** can mutate, but the manager pool is still inside the API process. Full API-process compromise could expose its manager credential and impersonate an actor at the SQL-function boundary. This is not a separate management-service isolation boundary or cryptographic database proof of Clerk identity. Owner acceptance of this deployment boundary, or an independently reviewed management process, is an activation gate.

The guarded launcher currently does not forward these new variables; this pass deliberately does not weaken or bypass its allowlists. Activation preparation must add API-only forwarding and strict post-0017 schema/grant/function verification together. Never start an unguarded API to work around that dependency. Normal app-role and manager secrets must remain separate.

## COURSE dependency

COURSE is denied by the permission map, strict request schemas and GLOBAL-only database CHECK. There is no course ID column, scope-creation API or arbitrary UUID acceptance. Phase 9C must provide verified course references, typed FKs and a separately reviewed delegation/permission policy before any COURSE assignment can be supported. Do not relax the GLOBAL CHECK or accept client-supplied course IDs as a shortcut.

## Activation prerequisites — all pending

- Resolve the local check-output issue: the operator reported exit 0 from the existing guarded check, but its expected JSON was not captured. This is not a verified current catalog/identity/question inventory receipt. The command was not rerun here.
- Separately authorize one current read-only baseline verification for the exact cluster, ordered 0017 ledger, 24-table schema, ownership, grants/RLS/functions and all 16 owner-designated questions/dependencies. Actual current records/counts have not been verified here.
- Establish a complete verified **post-0017** backup and matching isolated restore. Existing pre-0017 backup/rehearsal evidence cannot substitute. No backup/restore was executed and old evidence was not read in this source pass.
- Review/provision the dedicated manager LOGIN separately; no broad or inherited grants. Confirm definer owner and exact app/manager function/table/column/sequence privileges, including default ACLs and PUBLIC privileges.
- Generate/review the proposed snapshot/journal and checksum manifest, plus a dedicated next-migration executor and exact old/new startup branches. These are not prepared in this pass. Official journal stays at 17; unknown new tables/counts must keep failing closed. Do not run unrestricted Drizzle migrate or an older 0017 activation executor.
- Rehearse the exact SQL on a restored disposable baseline: syntax/function compilation, GLOBAL-only constraints, permission denial, SQL actor/target checks, Owner bootstrap, read pagination, idempotency/conflicts and audit insertion rollback. Require real simultaneous Owner revocations/demotions/status changes under READ COMMITTED and REPEATABLE READ, and demonstrate at least one active Owner remains. Offline SQL-structure checks do not prove these properties live.
- Verify all pre-existing content/history/security/sequence fingerprints unchanged, existing RLS and controlled deletion still intact, transactional rollback/repeat-migrator behavior, and committed isolated startup. No experimental data is disposable.
- Obtain separate migration/grant/bootstrap/maintenance approval and exact source promotion. Recheck before commit and in an independent read-only post-commit transaction. No main user/content mutation is an acceptance fixture.

Before commit, rollback the transaction on any mismatch. After commit/uncertainty, stop and diagnose read-only; never automatically retry bootstrap, reset sequences, delete audit, drop columns/tables or restore over newer records. Recovery needs separate authorization and must preserve all data.

## Verification scope and source files

Focused backend tests use query fixtures only; UI tests use mocked authenticated identity/API responses. They cover GLOBAL role policy/delegation/denial, strict COURSE rejection, inactive feature behavior, actor/session handling, bounded reads, separate mutation transport, retry identity/conflicts, SQL safety structure, UI confirmation/double-click protection/refresh, denied/inactive/empty states, and session cache cleanup. Localization regressions check dictionary completeness. TypeScript checks existing project references. Results are reported after the focused run; no database test, build, real Clerk flow or browser acceptance is claimed.

Final focused results: **19 API tests PASS** (policy/service/SQL structure and routes, two files); **20 frontend tests PASS** (five new GLOBAL administration tests plus 15 existing localization regressions, two files). Root `pnpm run typecheck`: **PASS**. An initial TypeScript check found three newly added dictionary keys damaged by PowerShell text encoding; those entries were corrected directly and the focused localization run/typecheck subsequently passed. No assertion was weakened or skipped. No full suite or production build was run.

API: `src/lib/global-rbac-policy.ts`, `global-rbac.ts`, `global-rbac.test.ts`; `src/routes/global-rbac.ts`, `global-rbac.test.ts`, route registration. Frontend: `components/global-user-admin.tsx`, its test, App route, Admin overview link, session query-family registration and central Arabic dictionary additions. Database source: new schema/export and the unregistered SQL proposal. This report is the only new activation document.

All changes remain local and uncommitted. No database/storage connection, migration execution, role bootstrap, live record modification, service restart, deployment, commit or push occurred. **DATABASE ACTIVATION NOT AUTHORIZED.**
