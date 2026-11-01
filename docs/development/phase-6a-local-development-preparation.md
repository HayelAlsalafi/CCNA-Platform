# Phase 6A local development preparation

Prepared 2026-10-10 (Asia/Riyadh). Worktree: `<historical-checkout>`.
Branch: `feature/phase-6a-question-bank-foundation`; base HEAD `15ce7882944a52934f1526db0c01ff84f61af51b`.
**Preparation only. No provisioning SQL, migrations, passwords, ADMIN changes or servers have been executed.**
PR #12 remains Draft. Phase 6A.4 remains paused. Original checkout/protected changes and both existing planning documents must remain untouched.

The owner reports an authenticated pgAdmin connection to the installed local PostgreSQL 18 service, role/database `postgres`, with only `postgres` as a non-template database. This is owner-provided evidence; the preparation agent has no administrator credential and has not independently queried that cluster. The initial read-only script must confirm the exact server and provide its system identifier.

## Exact targets and separation

- PostgreSQL: **127.0.0.1:5432**, installed service `postgresql-x64-18`, data directory `C:\Program Files\PostgreSQL\18\data`.
- New database: **ccna_phase6a_dev**. Do not use `postgres` as the application database.
- New roles: `ccna_phase6a_migrator` (owns this database/schema; no superuser, CREATEDB, CREATEROLE, replication, bypass-RLS or inherited role membership) and `ccna_phase6a_app` (runtime only).
- Never use Neon, external hosts, port 55433 or `ccna_clerk_isolation_test`. Existing database contents, roles, passwords, PostgreSQL service/listener settings and pg_hba.conf are not changed.
- Creating two new cluster roles/database does necessarily update PostgreSQL catalogs; this is separate future provisioning approval, not a modification of existing application users.
- Windows administrative rights do not replace the PostgreSQL login. Secrets stay local; no password is included in SQL, arguments, this document or tracked files.

## Approval gates and pgAdmin execution order

**Do not execute steps 2 onward until explicit provisioning approval.** Opening prepared SQL files for review is safe. There are no automatic creation/seed/promotion modes.

1. In pgAdmin ensure host **127.0.0.1**, port **5432**, database **postgres**, login **postgres**, no SSH tunnel. Open [00-preflight.sql](../../tools/phase6a-local/00-preflight.sql) and run its read-only transaction. Expect PostgreSQL 18, the installed data directory, no Neon branch, and no new database/role names. Obtain the decimal `system_identifier` and stop for review/approval. Do not send passwords.
2. After approval, in the SAME Query Tool connection set a session-only fingerprint (not a password):
   `SELECT set_config('ccna.bootstrap_system_identifier', '<confirmed decimal system identifier>', false);`
   Replace the placeholder locally. This setting is connection-local and must be set again after opening another Query Tool or reconnecting. Scripts fail if it is missing/mismatched.
3. Execute [01-create-roles.sql](../../tools/phase6a-local/01-create-roles.sql). It checks the installed cluster and rejects existing names rather than changing them. The two LOGIN roles have **PASSWORD NULL**, so SCRAM login cannot succeed yet.
4. Open [02-create-database.sql](../../tools/phase6a-local/02-create-database.sql), with pgAdmin auto-commit ON. Execute **Section A only**, then select and execute **only the single CREATE DATABASE statement in Section B** on the same unchanged connection. CREATE DATABASE cannot run in a transaction or combined multi-statement request. The new database initially disallows connections. Never run the entire file in one click.
5. Execute [03-lock-database.sql](../../tools/phase6a-local/03-lock-database.sql) from that `postgres` connection. It checks the expected owner/connection-disabled state, revokes PUBLIC access to the NEW database, grants CONNECT to the two new roles, then enables its connections.
6. Open a new Query Tool on **ccna_phase6a_dev**, still login **postgres**. Set the same session fingerprint again. Execute [04-prepare-schema.sql](../../tools/phase6a-local/04-prepare-schema.sql). It requires an empty database, prepares migration/schema ownership and creates a private, postgres-owned read-only identity helper. This operational helper is not an application-domain table or a new Drizzle migration. It exposes only local server identity; PUBLIC execution is revoked, and the app/migrator receive USAGE/EXECUTE only.
7. Only with approval, set the password of the **new migration role** via pgAdmin Login/Group Roles > ccna_phase6a_migrator > Properties > Definition. Enter a new strong password locally, keeping its privilege flags unchanged. Do not type passwords into Query Tool SQL or chat. Alternatively use psql's hidden `\password` prompt through the already authorized local operator login. Do not reset any existing role password.
8. After separately approved migrations, execute [05-grant-runtime.sql](../../tools/phase6a-local/05-grant-runtime.sql) in the new database as postgres with the fingerprint pinned. It requires four ledger entries and five application tables. Then set the password for the **new app role** locally through its pgAdmin Definition tab.
9. Execute [06-verify.sql](../../tools/phase6a-local/06-verify.sql) read-only. Expect database owner ccna_phase6a_migrator, both new roles non-privileged, four ledger entries, five tables, and all nine forbidden app permissions false. No users/ADMINs should exist before the first real login.

At any unexpected collision, identity/permission failure or partial provisioning result: stop and inspect. Do not silently reuse roles, rerun CREATE DATABASE, alter existing grants, or drop/clean objects. No automatic rollback/drop scripts are prepared. A failed transaction rolls back its own stage; successful earlier stages remain for review.

## Versioned migrations: prepared, unchanged

The existing files remain authoritative and unchanged:
1. `lib/db/drizzle/0000_baseline.sql`
2. `lib/db/drizzle/0001_question_domain.sql`
3. `lib/db/drizzle/0002_question_code_immutable.sql`
4. `lib/db/drizzle/0003_practice_attempts.sql`

The runner freezes normalized file hashes and journal order/timestamps. It applies Drizzle's `migrate` to the SAME already verified migration connection, using `drizzle.__drizzle_migrations`, with no application pool or Drizzle CLI/environment fallback. It requires an empty application schema and absent ledger, applies all four existing files, then compares the ledger to the actual file hashes (including checkout line endings). Do not run `push`, `push-force`, root dev scripts or seed here. No new question/revision/classification migration is introduced.

**Future command; not run during preparation:**
```powershell
Set-Location -LiteralPath '<historical-checkout>'
.\tools\phase6a-local\invoke.ps1 -Mode migrate -SystemIdentifier '<confirmed decimal identifier>' -Apply
```
The wrapper prompts invisibly for the NEW migrator password. No password/connection URL is placed in arguments or environment files. Migration approval must precede use of `-Apply`.

## Runtime permissions and honest boundaries

The app receives SELECT/INSERT/UPDATE on topics/questions/options and DELETE on question_options because the existing editor replaces options transactionally. It receives SELECT/INSERT only on practice_attempts, SELECT/INSERT on users, UPDATE only on user profile/login columns, sequence USAGE and enum/trigger-function permissions. It cannot UPDATE users.role/status, DELETE users/history/catalog parents, UPDATE history, reset the code sequence, create schema/database objects or read the migration ledger.

Existing auth explicitly INSERTs USER/ACTIVE. A runtime DB credential holder with users INSERT could manually supply different role/status values; column UPDATE restrictions do not claim to prevent arbitrary INSERT values. Those credentials remain server/operator-only. No speculative trigger/RLS or app auth bypass is added. SQL grants are confined to this new database; new roles may still inherit PostgreSQL PUBLIC CONNECT defaults on unrelated databases, which this work does not alter. Prepared tools enforce this database name regardless.

## Local-only guarded startup (not started)

[verify-service.ps1](../../tools/phase6a-local/verify-service.ps1) checks the installed service command/data directory and that port 5432 belongs to its postgres child **before any database connection**. [policy.mjs](../../tools/phase6a-local/policy.mjs) rejects every target except literal 127.0.0.1:5432/ccna_phase6a_dev, wrong roles, missing fingerprint, URL/query/PG overrides and non-development Clerk configuration. The actual read-only identity must match the database, role, address, port, PostgreSQL 18, data directory, fingerprint and absent Neon metadata.

[invoke.ps1](../../tools/phase6a-local/invoke.ps1) is the supported Windows entry point. It whitelists the child environment before Node starts (no inherited NODE_OPTIONS preload), accepts secrets via hidden prompts and private stdin, and never writes an env file. Existing ignored Windows native binaries may be used only from this worktree's fixed .local/native-deps path. No dependencies are installed by the launcher. No global execution-policy change is made.

[run.mjs](../../tools/phase6a-local/run.mjs) verifies the actual app role permissions/table set before startup. The API checks its real application pool identity again before listening. The frontend is created with configFile/envDir disabled, receives only the public Clerk key, and proxies explicitly to 127.0.0.1:3000. Both use source/modules from this worktree. The frontend requires the API listener to belong to this worktree's guarded Node invocation. API port 3000 and frontend port 8080 are checked on IPv4 and IPv6; only loopback listeners are started. Log output reports identifiers, never credential values/URLs.

Future approved commands in two terminals:
```powershell
.\tools\phase6a-local\invoke.ps1 -Mode check -SystemIdentifier '<confirmed decimal identifier>'
.\tools\phase6a-local\invoke.ps1 -Mode api -SystemIdentifier '<confirmed decimal identifier>' -Start
# After the API is ready, in a second terminal in the SAME worktree:
.\tools\phase6a-local\invoke.ps1 -Mode web -SystemIdentifier '<confirmed decimal identifier>' -Start
```
`check` is SELECT-only and starts no servers. API/web need separate startup approval and explicit `-Start`. API/check prompt for the app password, Clerk public and secret keys; web prompts for app password for its read-only DB preflight and public key only. Database and Clerk secret credentials are not placed in frontend environment/bundles. Plaintext necessarily exists temporarily in the local processes; hidden input is not a guarantee of memory erasure.

Clerk must use the known development instance **bursting-pangolin-4222.clerk.accounts.dev**. The public key's decoded instance and test prefixes are checked. A secret test prefix is only configuration evidence; whether that secret belongs to the same instance requires subsequent real Clerk authentication. No live Clerk call occurs during preparation or guard tests. Secret input and masked pgAdmin password UI remain user-controlled. No original .env/.env.local or sparse-excluded frontend .env is loaded/copied.

The guards apply to these explicit entry points; they do not alter generic app production startup or prevent an operator from bypassing them manually. Do not use generic `pnpm dev` or the original checkout's Neon-oriented local tools for this workflow.

## Separate ADMIN bootstrap and endpoint acceptance

No promotion SQL/CLI is included in provisioning or startup.
1. After approved startup, owner signs in through real Clerk; auth provisions an ACTIVE USER in this NEW database.
2. Verify current server-authenticated Clerk user ID and email against exactly one local row. The previous isolated mapping `user_3KBaP0eCIXHw86Q1FzYjZKAnX5Y` / label h.al.salafi001 is only a candidate; reverify, never copy the isolated row/UUID.
3. Seek explicit promotion approval. On the pinned new local database, an operator transaction locks that exact verified row, checks USER/ACTIVE, changes only its role to ADMIN (and updated_at), and commits only if one row matches. Roll back on mismatch. Use postgres/operator access, not app credentials; do not change Clerk metadata or other account statuses. The existing email-only CLI lacks this local fingerprint guard and should not be used directly.
4. Validate real browser HTTP: first `/api/auth/me` 200 USER/ACTIVE and `/api/admin/access` 403; after approval/promotion, 200 ADMIN/ACTIVE and 200 allowed=true. Unauthenticated requests must return 401. The UI normally suppresses admin/access calls for USER, so observe an intentional authenticated probe separately when approved.
5. Authenticated GETs can update user profile/login metadata. Future runtime/login/validation approval must cover those writes in the NEW dev database. No such calls were made during preparation.

Real Clerk admin transitions/server-bound session checks and the delayed learner Submit remain **Not Verified**. Already-authorized writes may finish after switching/sign-out. Migration execution, real DB permissions and new runtime are **Not Run**, not Passed.

## Preparation validation and preservation

Prepared tests: `node --test tools/phase6a-local/policy.test.mjs`. They use pure configuration fixtures and mocked clients; no PostgreSQL/Clerk connection, auth bypass or fake bearer token.
Preparation results:
- `node --test tools/phase6a-local/policy.test.mjs`: **59 passed, 0 failed**. Coverage includes target rejection before client creation, actual-identity mismatch rollback/cleanup, explicit operation gates, role attributes/permissions, inherited environment isolation, reserved password character encoding, migration/ledger consistency, and sanitized errors. The first run found a percent-character encoding bug; it was fixed and the final full run passed.
- `node --check tools/phase6a-local/policy.mjs`, `node --check tools/phase6a-local/run.mjs`, and `node --check tools/phase6a-local/policy.test.mjs`: syntax checks passed.
- PowerShell `[Management.Automation.Language.Parser]::ParseFile` on `invoke.ps1` and `verify-service.ps1`: both parsed with zero errors; no wrapper execution.
- `powershell.exe -NoProfile -File tools/phase6a-local/verify-service.ps1`: passed outside the restricted sandbox; OS-only service/listener verification, no database connection. The sandbox denied Windows CIM access; the privileged read-only check verified the installed service and listener.
- `git diff --check`: passed for tracked changes (there are no tracked modifications). All 13 prepared files passed separate trailing-whitespace and credential-pattern checks; zero matches. The final read-only preservation check matched all 606 original baseline hashes, original branch/HEAD/status/index, and both planning-document hashes. The Phase 6A branch/HEAD and tracked/index content remain unchanged, and the sparse-excluded frontend .env remains absent. Ports 8080/3000 have no IPv4 or IPv6 listeners.
- SQL: manually reviewed only; **Not Run / not PostgreSQL-validated**. Application startup, native runtime module loading, database creation, migrations, actual database ACLs, and real Clerk authentication are **Not Run**. These offline results are not evidence of successful provisioning or end-to-end startup.

The app credential remains server-only. Migration-role ownership permits DDL inside the dedicated database; it is intentionally not the runtime credential. Existing PostgreSQL service network bindings are preserved; these guards enforce a loopback client target and API/web binding, not a server firewall policy.

Both worktrees' branch/HEAD/index, original 606 baseline hashes/53 protected changes, the two uncommitted planning documents and sparse exclusion must remain unchanged. New changes are only this document and tools/phase6a-local preparation files; no package/lockfile, application source, existing migration, environment, commit, push or PR update.
