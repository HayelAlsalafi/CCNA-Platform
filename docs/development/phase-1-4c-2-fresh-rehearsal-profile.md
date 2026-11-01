# Phase 1.4C-2 — Fresh taxonomy rehearsal profile

Status: **PREPARATION COMPLETE; environment creation and database execution NOT AUTHORIZED / NOT RUN.**
Date: 2026-10-12. Workspace: `<repository-root>`; branch `main`; HEAD `03b14526aae448e49eacd602a43bfb0e355aca4d`.

The original environment at port `55439` is retained after its four passed groups and RESTRICT expectation failure. Its manifest, entrypoint, safety helpers, database, cluster and logs are not modified by this preparation. This profile is a fresh full rehearsal, with no resumption over the original fixtures. The [original plan and failure analysis](phase-1-4a-taxonomy-rehearsal-plan.md#phase-14c-failure-and-recovery-preparation) remain historical records.

## Fixed second target

| Item | Exact value |
| --- | --- |
| Host / port | `127.0.0.1:55440` |
| Database | `ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170` |
| Owner | `ccna_taxonomy_rehearsal_owner_8e6c4b9a2170` |
| Profile ID / nonce | `8e6c4b9a2170` |
| PostgreSQL | `18.6`, version number `180006` |
| Installed binary directory | `C:\Program Files\PostgreSQL\18\bin` |
| Run directory | `<repository-root>\.local\taxonomy-rehearsal\ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170` |
| Data directory | `<run directory>\data` |
| Ownership marker / server log | `<run directory>\owner.json` / `<run directory>\postgres.log` |

Neither new directory nor port availability was tested as an execution preflight during preparation. The creation gate must check them immediately before creation, without touching any existing listener or path.

## New files and integrity guards

All executable profile files are under `tools/taxonomy-rehearsal/profiles/8e6c4b9a2170/`:

- `manifest.json`: fixed new identity; the same 11 migration/metadata input hashes as the original manifest, plus five source pins (original manifest, corrected original harness, shared safety helper, new entrypoint and creation script).
- `profile.mjs`: pure guards with no filesystem/network operations. Rejects any changed manifest bytes, freezes all decoded nested data, enforces every fixed identity field, validates source hashes, constructs explicit connections, and checks path/marker/PID/executable/server identities.
- `rehearsal.mjs`: separate entrypoint. Defaults to `--plan`; also supports inert `--print-hba`, separately authorized read-only `--verify-maintenance`/`--verify-empty`, and separately authorized `--execute-disposable`. No cleanup, resume, arbitrary manifest, URL, database, host, port or credential arguments. Its full SQL/fixture/assertion body is identical to the corrected original; an offline regression checks that parity.
- `create-environment.ps1`: defaults to inert plan output. Only explicit `-Create` passes the creation gate. Stops on any mismatch or native-command error, with no repair, retry, overwrite, shutdown or deletion.
- `profile.test.mjs`: offline identity/refusal/immutability/hash tests, source parity and creation-gate checks. Only inert modes and deliberately invalid CLI modes are invoked.
- This documentation file. No existing file is changed.

Manifest SHA-256 pinned by the decoder: `53c4211a30e3ee41603dd91e6b78757020d14c1d3cd78cf5180b094ee5b968f8`. Source pins include the corrected original harness SHA-256 `4092bed89d5135ba6d1a54ef1d8b7226896c27d05e93b07ab149c420b302332d`. The six SQL files are unchanged; proposed `0005` remains `d1d40e488a00c14c7958dc5b1f83bda5e4bb420a4d05974ae92c3f6ca0027226`. The journal still ends at `0004`; no migration promotion occurs here.

Immutability is enforced by exact-byte hashes, fixed guards and recursive freezing, rather than filesystem permissions. Changes, including line-ending changes to pinned files, must fail and require source review and explicit repinning. The new entrypoint reads the original manifest only as a pinned source; it never uses it as connection configuration or a fallback.

Before driver loading, execution modes require canonical new paths, the exact ownership marker, exactly seven HBA records, a ready positive postmaster PID with the new port/data directory, exactly one IPv4 listener owned by that PID, and the exact installed executable/version. Server identity then uses `host(inet_server_addr())` with exact `127.0.0.1`, not prefix matching. Connection parameters explicitly fix the new host/port/owner/database, SSL mode and an unused trust password. Potential process overrides are cleared without reading their values; no application module, environment file or application credential is loaded. The only maintenance connection allowed is the new cluster's own `postgres` database on port `55440`.

## Hardened private authentication

The creation script replaces only the new initdb HBA file, before startup, with:

```text
local all all reject
local replication all reject
host ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170,postgres ccna_taxonomy_rehearsal_owner_8e6c4b9a2170 127.0.0.1/32 trust
host all all 0.0.0.0/0 reject
host replication all 0.0.0.0/0 reject
host all all ::/0 reject
host replication all ::/0 reject
```

The one IPv4 allow rule precedes the matching rejection. Physical replication needs its own rejects because database `all` does not match it. The fresh cluster explicitly sets `listen_addresses='127.0.0.1'`, `port=55440`, `ssl=off` and `unix_socket_directories=''`. It does not change the original HBA or a Windows service.

The read-only verification modes validate server settings, seven parsed HBA records, allowed database inventory and exact owner. Expected rejection probes: unauthorized role `postgres`, database `template1`, physical replication (`28000`, HBA rejection), and IPv6 `::1` (`ECONNREFUSED`). Local sockets have no endpoint; a live socket probe is NOT RUN and the explicit local-reject records are inspected instead. Maintenance verification requires the new target database to be absent; empty verification requires it present with zero user relations, public types and public functions.

## Safe checks performed during preparation

```powershell
node --test tools/taxonomy-rehearsal/safety.test.mjs tools/taxonomy-rehearsal/restrict-regression.test.mjs tools/taxonomy-rehearsal/profiles/8e6c4b9a2170/profile.test.mjs .local/tests/phase1-4b-20261012/identity-regression.test.mjs
node --check tools/taxonomy-rehearsal/profiles/8e6c4b9a2170/profile.mjs
node --check tools/taxonomy-rehearsal/profiles/8e6c4b9a2170/rehearsal.mjs
node --check tools/taxonomy-rehearsal/profiles/8e6c4b9a2170/profile.test.mjs
node tools/taxonomy-rehearsal/profiles/8e6c4b9a2170/rehearsal.mjs --plan
powershell.exe -NoProfile -File tools/taxonomy-rehearsal/profiles/8e6c4b9a2170/create-environment.ps1
node tools/taxonomy-rehearsal/rehearsal.mjs --plan
```

Results: **107 tests passed, 0 failed, 0 skipped**, including 58 new profile tests and 49 existing offline tests. Three Node syntax checks and PowerShell AST parsing passed. New plan mode validates 11 migration/metadata and five source hashes, lists all nine groups, and reports `databaseOperations: 0`. The creation script's default mode is likewise inert. These checks establish source/guard behavior; they do not prove real PostgreSQL authentication, schema enforcement or concurrency on this target.

## Next authorized step: approval A2 for environment creation

Run from the exact verified workspace, only after explicit approval covering creation, startup, the empty database, and read-only identity/authentication checks:

```powershell
powershell.exe -NoProfile -File tools/taxonomy-rehearsal/profiles/8e6c4b9a2170/create-environment.ps1 -Create
if ($LASTEXITCODE -ne 0) { throw 'Second environment setup stopped; preserve both environments' }
```

The script first runs immutable plan/source checks (including exact branch/HEAD), refuses reparse-point parents, an existing new run directory or occupied port, verifies installed PostgreSQL 18.6, and obtains the hardened HBA. It clears native connection overrides without reading them and directs service/password-file paths to absent files in the new run directory. Only then does it create that directory and invoke:

```powershell
# Expanded fixed native commands performed by -Create, not standalone shortcuts:
& 'C:\Program Files\PostgreSQL\18\bin\initdb.exe' --pgdata='<repository-root>\.local\taxonomy-rehearsal\ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170\data' --username=ccna_taxonomy_rehearsal_owner_8e6c4b9a2170 --encoding=UTF8 --locale=C --auth=trust
# The script writes the new marker/HBA/loopback-only configuration before startup.
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' -D '<repository-root>\.local\taxonomy-rehearsal\ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170\data' -l '<repository-root>\.local\taxonomy-rehearsal\ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170\postgres.log' -w -t 30 start
node tools/taxonomy-rehearsal/profiles/8e6c4b9a2170/rehearsal.mjs --verify-maintenance
# createdb is reached only after successful exact server/HBA/authentication checks:
& 'C:\Program Files\PostgreSQL\18\bin\createdb.exe' --host=127.0.0.1 --port=55440 --username=ccna_taxonomy_rehearsal_owner_8e6c4b9a2170 --owner=ccna_taxonomy_rehearsal_owner_8e6c4b9a2170 --maintenance-db=postgres --template=template0 --no-password ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170
node tools/taxonomy-rehearsal/profiles/8e6c4b9a2170/rehearsal.mjs --verify-empty
```

Stop after identity, authentication and emptiness reporting. Failure retains the new files/cluster and the untouched original environment. A2 does not authorize migrations, fixtures, rehearsal assertions or cleanup.

## Later approval B2: full migration/fixture/assertion rehearsal

After successful A2 verification and separate explicit execution approval, rerun offline checks and exact empty-target verification, then run once:

```powershell
node tools/taxonomy-rehearsal/profiles/8e6c4b9a2170/rehearsal.mjs --verify-empty
if ($LASTEXITCODE -ne 0) { throw 'Fresh-target preflight refused; no rehearsal' }
node tools/taxonomy-rehearsal/profiles/8e6c4b9a2170/rehearsal.mjs --execute-disposable
if ($LASTEXITCODE -ne 0) { throw 'Rehearsal stopped; preserve both databases and logs' }
```

| Group | Expected result |
| --- | --- |
| 1. Apply 0000–0003, insert legacy fixtures, apply 0004, insert revision/delivery/bound attempt, capture baseline, apply 0005 | Existing seven-table rows/schema and question-code sequence exactly preserved; legacy NULL bindings; no automatic classification |
| 2. Inspect taxonomy constraints and primary index | Validated FKs; valid unique partial index on `(question_id, blueprint_id)` with predicate `is_primary` |
| 3. Multiple objectives, domain/blueprint independence and duplicate mapping | Multiple secondary objectives accepted; one primary per question/blueprint; duplicates rejected `23505` with exact names |
| 4. Missing references and cross-blueprint mappings | Rejected `23503` with exact FK names |
| 5. Referenced question/objective/domain/blueprint deletion | Explicit RESTRICT rejects `23001`, with all four exact FK-name assertions preserved |
| 6. Existing revision/delivery/attempt binding, immutability and question code | Existing rules reject invalid operations with `23514` |
| 7. Concurrent promotions, first COMMIT | Observe contender lock wait; contender rejects `23505` for `question_objectives_primary_uq`; one primary |
| 8. Concurrent promotions, first ROLLBACK | Observe lock wait; contender succeeds; one primary |
| 9. Final original row/sequence comparison | Exact original fixture preservation after all assertions/races |

Rejection tests use SAVEPOINT/outer ROLLBACK; migration and fixture commits are retained on failure. Concurrency preserves the shared bounded waits and deterministic session cleanup; timeouts never count as uniqueness passes. Any SQL, fixture, assertion, identity or authentication failure stops without retries, repairs, migration edits, resets or target reuse.

## Remaining risks and approval boundaries

Actual new-target startup, authentication, fixture acceptance, corrected RESTRICT cases and concurrent outcomes remain NOT RUN. Windows process/listener inspection may require permission; failure must stop rather than bypass checks. Trust authentication permits another local process to claim the allowed owner name, so this is a short-lived disposable local environment, not an application authentication scheme.

The copied assertion body is protected by source parity tests and source pins; future changes require explicit review/repinning. This raw-SQL rehearsal does not verify the Drizzle migration ledger or second-run idempotence, production-role privileges, real Clerk identity, learner HTTP contracts, or deployment. Those remain separate work.

Required future approvals: **A2** new cluster/startup/database/read-only checks; **B2** migrations/fixtures/all nine groups; **C2** any exact-target cleanup or private shutdown; **D** migration promotion and actual Drizzle migrator rehearsal. No cleanup is provided by this profile. Preparation authorizes none of these database actions.
