# Phase 2B readiness verification results

29 October follow-up: actual isolated PostgreSQL results and current metadata
pins are recorded in `phase-2b-0014-isolated-rehearsal-results.md`. The NOT RUN
entries below describe the earlier preparation stage; media remains unconfigured.

28 October 2026. Workspace `<repository-root>`, branch `main`,
HEAD `3c07b4bb7fe807e60dcbcd5539c046b919a9956f`. Existing uncommitted work retained.

| Command/check actually executed | Result |
| --- | --- |
| Operator: `powershell.exe -NoProfile -File tools/study-activation/prepare-backup.ps1 -Backup` | PASS: exact live identity, 13-entry ledger, existing 19-table schema and lesson permissions; consistent full snapshot archive; application writes 0 |
| `node tools/study-activation/verify-backup.mjs '<reviewed study-backup.json path>'` | PASS: independently verified receipt, raw archive hash/size, 19 tables + ledger, TOC and full archive decoding; database connections 0 |
| `node tools/study-activation/readiness.mjs --plan` | PASS: exact target/proposal/current manifest; apply unsupported; no credentials or connection |
| `node --test tools/study-activation/readiness.test.mjs tools/study-activation/backup.test.mjs` | **8 passed, 0 failed**; offline/mock checks only |
| `node tools/run-curriculum-tests.mjs --lessons` | **217 passed, 0 failed, 14 files**; mocked DB, isolated PostgreSQL flags disabled |
| `node tools/check-admin.mjs` | PASS: API, frontend, DB schema and API-client TypeScript |
| `node tools/check-study-codegen.mjs` | PASS: 8 spec/generated files reproduce; no dependency installation or database access |
| `node tools/build-admin-ui.mjs` | PASS: production frontend build; existing sourcemap notices and >500 kB chunk warning remain |
| `node --check` on new non-test JS and PowerShell parser on backup wrapper | PASS |
| Scoped `git diff --check` | PASS; untracked additions additionally checked by syntax/tests/source review |
| OS listener inventory, port 55440 | Inspection succeeded, 0 listeners; no cluster start or database connection |
| Isolated backup restoration / migration 0014 / repeat / rollback / real RLS persistence | **NOT RUN — private cluster stopped** |
| Persistent media root / actual upload-publication-read-recovery | **NOT RUN — not provisioned or activated** |
| Browser or live authenticated study endpoints | **NOT RUN**; no claim of end-to-end verification |

Initial test/codegen/metadata attempts encountered sandbox directory-access errors;
the required offline checks were rerun with elevated tool access and passed. The
protected backup also required elevated read access because of its restricted
NTFS ACL. No ACL was weakened. Earlier asynchronous check sessions expired across
the operator handoff; final test/type/build runs were captured under
`.local/study-metadata/*-verification.log` and the actual final results above were
read. No unrelated tests or fixes were performed.

Focused existing tests cover study readiness, exact revision/text anchors,
owner-spoof rejection, owner predicates/context, foreign-ID mutation rejection,
stale versions, explicit progress completion, published visibility, generated
contracts, authenticated routes, Admin upload authorization, MIME/signature and
size validation, traversal/exclusive filesystem writes and retention. They mock
PostgreSQL, so they do not establish actual RLS, FK, transaction or persistence
behavior. The new preparation tests cover exact 13→14 metadata delta, exclusion
of 0012, offline planning, unsafe flag refusal, identity/ledger fail-closed
rollback and backup receipt tampering/incomplete coverage/unperformed-gate claims.

## Files added in this readiness task

- `tools/prepare-study-metadata.mjs` — offline, write-once proposed metadata generator.
- `lib/db/drizzle/proposed/meta/0014_snapshot.json`.
- `lib/db/drizzle/proposed/meta/0014_journal.json`.
- `tools/study-activation/proposal.mjs` — exact source pins and additive metadata validation.
- `tools/study-activation/readiness.mjs` — SELECT-only post-0013 baseline inspection and inert plan.
- `tools/study-activation/backup.mjs` — consistent snapshot/full backup; no apply mode.
- `tools/study-activation/prepare-backup.ps1` — hidden prompt, stdin-only credential handoff, clean environment.
- `tools/study-activation/verify-backup.mjs` — offline protected receipt/archive verification.
- `tools/study-activation/readiness.test.mjs`.
- `tools/study-activation/backup.test.mjs`.
- `docs/development/phase-2b-migration-0014-readiness.md`.
- `docs/development/phase-2b-media-storage-readiness.md`.
- `docs/development/phase-2b-verification-results.md`.

Modified: `docs/development/phase-2b-activation-readiness.md` only to link the
follow-up evidence and clarify superseded pending statements. The original Phase
2B implementation and unrelated existing changes were preserved. No migration SQL,
official Drizzle metadata, application runtime source, runtime grants or launcher
configuration was changed. Offline code generation reproduced existing content.

The backup/receipt were newly created by the operator in a unique protected local
folder; prior backups were not overwritten. No live application writes, media
activation, runtime permission changes, resets, service starts/restarts, commits
or pushes were performed. Overall recommendation remains **NO-GO for activation**.
