# Existing local database: taxonomy upgrade

This delivery prepares a separate upgrade operation. **No database connection, migration, grant or role change was executed during this task.** Initial `migrate -Apply` remains restricted to an empty public application schema with no Drizzle ledger. Do not use initial provisioning or the old `05-grant-runtime.sql` to upgrade this populated database.

## Exact target and authorization

- Workspace: `<repository-root>`; branch `main`; HEAD `03b14526aae448e49eacd602a43bfb0e355aca4d`.
- PostgreSQL system identifier: `7694701597474139084`.
- Database: `ccna_phase6a_dev`; host `127.0.0.1`; port `5432`.
- Upgrade/check/verify connection role: `ccna_phase6a_migrator`.
- Installed PostgreSQL 18 service, service-child listener and canonical data path remain checked by the existing service verifier. No service is stopped, restarted or changed.
- Password comes from the existing hidden interactive prompt through private stdin, never a URL, environment file, command-line argument or diagnostic. These modes do not request Clerk credentials. The existing environment whitelist remains in place.

The following database commands are provided for **separately authorized execution by the user**, not executed as part of source preparation.

## Commands

Run from the exact workspace. Read-only pre-upgrade verification (expects exactly five entries and no taxonomy objects):

```powershell
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode upgrade-check -SystemIdentifier 7694701597474139084
```

Expected JSON includes `mode:"upgrade-check"`, `ledgerEntries:5`, `pending:["0005_exam_taxonomy"]`, `databaseWrites:false`, the exact target/migrator role, and `clusterFingerprintVerified:true`.

Explicit upgrade:

```powershell
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode upgrade -SystemIdentifier 7694701597474139084 -Apply
```

Expected successful JSON includes:

```json
{
  "mode": "upgrade",
  "database": "ccna_phase6a_dev",
  "address": "127.0.0.1",
  "port": 5432,
  "role": "ccna_phase6a_migrator",
  "clusterFingerprintVerified": true,
  "applied": ["0005_exam_taxonomy"],
  "ledgerEntries": 6,
  "existingDataPreserved": true,
  "taxonomyTablesVerified": true,
  "taxonomyEmpty": true,
  "runtimePrivileges": { "ready": false, "missing": ["...exact missing privileges..."], "unsafe": [] },
  "committed": true
}
```

The privilege report is conditional: `ready:true` means the required grants already exist. A successful schema commit with `ready:false` does not perform grants or authorize starting the application. It reports what is missing and preserves the successful upgrade. Do not rerun `upgrade` after success; a six-entry database is deliberately refused by that operation.

Read-only post-upgrade verification, also usable after granting privileges or later taxonomy edits:

```powershell
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode upgrade-verify -SystemIdentifier 7694701597474139084
```

Expected: `ledgerEntries:6`, `taxonomyTablesVerified:true`, `databaseWrites:false`, and an exact runtime privilege report. Unlike the immediate upgrade check, this verification permits reviewed taxonomy rows to exist. It fails on unsafe privileges; missing privileges are reported without modifying them.

## Upgrade safeguards

1. Validate exact workspace/branch/HEAD, pinned identifier and migrator role before connection. Reject arbitrary hosts, aliases, ports, database names, connection options, credentials from environment, and unexpected flags. `upgrade` requires `-Apply`; read-only modes reject `-Apply`/`-Start`.
2. Verify all six official migration files against the existing reviewed source hashes and journal timestamps/order. Pin the existing 0004/0005 snapshot content with newline normalization. Ledger hashes match actual file bytes, as the installed Drizzle reader computes them; do not repair a mismatch by editing the ledger or changing source hashes.
3. In the existing read-only preflight, verify actual server identity, restricted migrator attributes/memberships, migrator-owned schemas and tables, and exactly 0000–0004 ledger hashes/timestamps. Compare columns/types/nullability, constraint inventory/keys/FK targets/delete actions/validation/enforcement, index columns/uniqueness/predicate/validity, enums and sequence inventory against reviewed metadata. Reject missing, partial or unexpected taxonomy objects. PostgreSQL 18 also records NOT NULL constraints as `contype=n`; validate those bindings against column nullability rather than treating their generated names as Drizzle table constraints. Unenforced/unvalidated/deferred constraints are refused. See [PostgreSQL 18 constraint catalog](https://www.postgresql.org/docs/18/catalog-pg-constraint.html).
4. Start one outer transaction on that same verified connection; recheck identity. Acquire a nonblocking advisory lock and bounded SHARE locks on all seven existing application tables and the ledger. An occupied lock fails rather than waiting indefinitely. Existing writes should be quiescent for this short upgrade window; the script does not stop API processes.
5. Recheck the five-entry state under locks. Stream every existing row in ID order through SHA-256, recording counts without logging contents. Compare the existing question-code sequence, defaults, user triggers and public functions before/after. New FK internal triggers are expected additions; user triggers remain preserved.
6. Invoke the **installed official `drizzle-orm/node-postgres/migrator`**, using the full official migration folder. Its last verified timestamp leaves only 0005 pending. A connection-local adapter binds the migrator's internal BEGIN/COMMIT/ROLLBACK to a savepoint. This prevents its inner COMMIT from committing before the outer preservation checks. There is no manual SQL migration execution, pool, CLI fallback or seed.
7. Before the outer COMMIT, require the six-entry ledger with all five old ledger IDs/hashes/timestamps unchanged, the reviewed new schema including partial primary uniqueness and composite FKs, four empty taxonomy tables, and equal existing row/sequence/behavior fingerprints. Unsafe new runtime privileges abort; missing expected privileges are reported without grants.
8. Any failure before COMMIT rolls back transactional schema/ledger changes, closes the connection and returns a sanitized error. No retries, reset, repair, drop or cleanup occur. PostgreSQL sequence allocation is not transactional: a failed ledger insert can leave a normal gap in the ledger sequence. The existing application question-code sequence is only read and must remain unchanged.

There is a three-second lock timeout and ten-second statement timeout for execution. Fingerprinting scans all existing rows, so duration depends on data volume. Unexpected state, a timeout, or an uncertain client disconnect at COMMIT requires review using the read-only verifier, never automatic retry/reset. Fingerprint equality is a checked preservation invariant, not a backup.

## Narrow runtime grants, if required

Prepared, inert file: `tools/phase6a-local/07-grant-taxonomy-runtime.sql`. It must receive separate approval and be executed as local `postgres` only after upgrade verification. It checks the exact system identifier/host/port/database/data path/version, six **raw** ledger hashes/timestamps, migrator-owned taxonomy tables, restricted app role and absence of unsafe privileges. It refuses unexpected privileges instead of revoking or repairing them.

Only these grants are included:

- SELECT, INSERT, UPDATE on the four new taxonomy tables.
- DELETE on `question_objectives` only, required for explicit association replacement.
- USAGE on `exam_blueprint_status`.
- USAGE on the existing `question_code_seq`; migration 0005 creates no new sequences. No sequence UPDATE, taxonomy record DELETE, TRUNCATE, REFERENCES, TRIGGER, default privileges or grant options are added.

Separately approved administrator command, with explicit connection fields, a hidden password prompt and no psql startup file:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -X -W -v ON_ERROR_STOP=1 -d "host=127.0.0.1 hostaddr=127.0.0.1 port=5432 dbname=ccna_phase6a_dev user=postgres sslmode=disable connect_timeout=5 options='-c statement_timeout=10000 -c lock_timeout=3000'" -f tools/phase6a-local/07-grant-taxonomy-runtime.sql
```

Expected successful grant output: BEGIN, SET statements, DO, four GRANT results, COMMIT. It never changes question/topic/history data or role definitions. Re-run `upgrade-verify` afterward; `runtimePrivileges.ready` should be true. Missing existing public-schema usage or unrelated historical privileges remain blockers for review, not an excuse for blanket grants. The grant file's ledger hashes are pinned to the current reviewed raw Windows checkout; line-ending/source mismatch must stop for review.

After privilege verification, the existing `-Mode check`/API/web launch modes retain their real Clerk checks and restricted historical permissions. They now require eleven application tables and the narrow taxonomy privileges; no authorization bypass was introduced.

## Files and executed validation

Modified: `tools/phase6a-local/invoke.ps1`, `policy.mjs`, `policy.test.mjs`, `run.mjs`. Created: `upgrade.mjs`, `upgrade.test.mjs`, inert `07-grant-taxonomy-runtime.sql`, and this document. No application source, migration SQL/metadata, lockfile, secrets or rehearsal environments were changed by this task.

Offline tests:

```powershell
node --test --test-reporter=spec tools/phase6a-local/policy.test.mjs tools/phase6a-local/upgrade.test.mjs
```

Result after the catalog-decoding correction: **117 passed, 0 failed** (69 existing policy tests and 48 focused upgrade tests). Tests cover exact target/flags, ledger mismatch, metadata drift, PostgreSQL 18 NOT NULL/enforcement, installed-driver array decoding, sanitized binding diagnostics, predicate formatting, table locks, preservation rollback, concurrency refusal, already-upgraded refusal, scoped grant hashes and credential gates. One test invokes the actual installed Drizzle migrator against a fake query driver and proves only 0005 runs under the guarded savepoint; this makes no PostgreSQL connection. Live PostgreSQL transaction/upgrade/grant behavior is **NOT RUN** under this task's authorization.

Node syntax checks of launcher/policy/upgrade modules, PowerShell AST parsing (without invoking the launcher), and `git diff --check` also passed. Earlier offline failures exposed a raw-versus-normalized snapshot pin and shared mutable mock rows; both were corrected without relaxing assertions.

## PostgreSQL 18 NOT NULL catalog decoding correction

The reported `Unexpected NOT NULL constraint binding.` came from `readSchemaCatalog()` in `tools/phase6a-local/upgrade.mjs`. Its constraint query constructed `ARRAY(SELECT a.attname ...) AS columns`. PostgreSQL's `attname` is the internal `name` type; that constructor therefore produces `name[]`. The installed `pg` text decoder has no `name[]` (OID 1003) parser and returns `"{id}"`, a JavaScript string with length 4, rather than `["id"]`. The validator required exactly one array element naming an `attnotnull=true` column. Earlier mocked fixtures provided JavaScript arrays directly, so they missed this driver boundary.

Expected catalog structure remains unchanged: `contype=n`, one attribute number in `conkey`, the same table's ordinary non-dropped column, `attnotnull=true`, validated/enforced and non-deferred. The correction casts each identifier to text inside the derived arrays. Constraint columns, FK target columns and index columns now return `text[]`; enum-label aggregation likewise casts labels to text. The installed text-array (OID 1009) parser returns actual JavaScript arrays. No global type parser, array-string fallback or weakened constraint acceptance was added. [PostgreSQL attribute catalog](https://www.postgresql.org/docs/18/catalog-pg-attribute.html), [array constructors](https://www.postgresql.org/docs/18/sql-expressions.html#SQL-SYNTAX-ARRAY-CONSTRUCTORS), [node-postgres type decoding](https://node-postgres.com/features/types).

Eight new offline tests cover the installed decoders, a full before/after metadata round-trip, rejection of undecoded/empty/multiple/missing/nullable bindings, and safe diagnostics. Remaining checks of PKs, composite FKs, NOT NULL enforcement, schema structure, pinned migration files and the exact ledger remain active.

Diagnostics now include a fixed invariant, validated table/constraint identifiers, the failed metadata field and a validated column identifier where available. The error code is `UPGRADE_CATALOG_BINDING`. Unsupported identifier text is replaced by `<invalid-identifier>`; raw arrays, SQL, driver messages and connection input are never included in these errors.

This bug was reproduced with the real installed decoder and synthetic catalog rows, without a database connection. The particular first failing constraint in the application database and absence of additional live schema drift have **not** been verified. If another binding error remains, stop and review its invariant; do not modify the schema or accept unexpected bindings.

Optional SELECT-only inspection, to run manually in the already verified `ccna_phase6a_dev` connection at `127.0.0.1:5432` (not executed by this task):

```sql
SELECT local_runtime_guard.identity() AS identity;

SELECT n.nspname AS schema_name, t.relname AS table_name,
       c.conname AS constraint_name, c.contype, c.conkey,
       cardinality(c.conkey) AS key_count,
       c.convalidated, c.conenforced, c.condeferrable, c.condeferred,
       k.attnum, a.attname::text AS column_name,
       a.attnotnull, a.attisdropped,
       pg_typeof(ARRAY[a.attname])::text AS original_array_type,
       pg_typeof(ARRAY[a.attname::text])::text AS corrected_array_type
FROM pg_catalog.pg_constraint c
JOIN pg_catalog.pg_class t ON t.oid = c.conrelid
JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
LEFT JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum, position) ON true
LEFT JOIN pg_catalog.pg_attribute a
       ON a.attrelid = c.conrelid AND a.attnum = k.attnum
WHERE n.nspname = 'public' AND c.contype = 'n'
ORDER BY t.relname, c.conname, k.position;
```

The second query reads metadata only, preserves unresolved attribute references for diagnosis, and contains no application rows or credentials. Review each returned binding against the declared invariant. Re-run the existing read-only `upgrade-check` command above after the source correction; do not execute `upgrade -Apply` or grants as part of this diagnosis.
