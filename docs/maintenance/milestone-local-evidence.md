# Milestone portability and local evidence

The `lesson-deletion-v1` milestone includes the completed CCNA NEXUS source, tests, exact applied migrations through **0016**, migration proposals, configuration templates and implementation documentation. The user verified lesson deletion in the browser. Historical reports retain their original checkpoint results; they do not supersede this accepted migration state.

## Local tooling

JavaScript tooling derives the canonical checkout from `tools/workspace-root.mjs`; PowerShell derives it from `tools/workspace-root.ps1`. Working-directory/branch checks, PostgreSQL identities and directories, ports, roles, immutable-revision checks, migration-byte checksums and approval gates remain enforced. Moving a checkout does not authorize a different database or migration. Historic migration executors retain their reviewed commit/source pins and must not be used to replay applied migrations.

Credentials, `.env` files, local databases, backups, logs, receipts, installed `.agents` skills, Windows cache databases and generated import runs stay outside Git. `.env.example` files contain configuration names/placeholders only. Versioned API clients/contracts and Drizzle snapshots are required source, not disposable build output.

Some historical startup/activation validators require exact local approved evidence:

- `tools/canonical-chapters-original-approval.json` and `tools/canonical-chapters-plan.json`;
- reviewed private rehearsal profiles under `tools/taxonomy-rehearsal/**/manifest.json`;
- backup, activation and rehearsal receipts under ignored `.local/` folders;
- generated chapter content/import packs and binding receipts, when using historical authoring tools.

These artifacts are intentionally not published. On a new checkout, restore required approved evidence from the protected operator archive, preserving exact bytes/hashes. Do not manufacture receipts, replace approved hashes, copy credentials into source, point a guard at another server, or run Apply to repair missing evidence. Missing evidence must stop the relevant operation. The latest activation wrappers explain `LOCAL_EVIDENCE_REQUIRED`; other historical tools retain their closed approval gates. Application compilation does not require those private artifacts. A new environment requires its own separately reviewed identity/activation procedure.

Source PDF references use filenames rather than a personal Downloads path. Database-backed published lessons remain authoritative; this Git milestone does not export application or learner records.

## Exam backend — NOT ACTIVATED

Exam Simulator source and proposed `0012_exam_simulator.sql` are retained for future review. **The database-backed Exam backend is NOT ACTIVATED and is not claimed operational.** Its proposed migration is absent from the active journal. Startup keeps the verified lesson/media chain; no Exam migration or permission change is implicit.

The availability gate checks for Exam tables, its guard function and required runtime permissions. When absent, the UI explains the inactive state and disables starting an exam; service operations return `503 FEATURE_NOT_READY` before opening a transaction. There is no demo-data fallback, schema creation or automatic migration. All currently active application phases remain available. Activating Exams requires a separate migration-chain design and explicit approval.

## Git classification and retention

Include application/API/schema source, required generated contracts, tests, tools, templates, licensed public assets and documentation. Preserve intentional removal of obsolete Replit/Bun/Lovable sandbox configuration. Exclude `.agents/`, `%SystemDrive%/`, `.local/`, backup copies (`*.bak`), receipts/audit inventories, generated import runs, secrets and transient build output. Exclusion does not delete local files or old backups. No data, service or authentication changes are part of publishing this milestone.

The deferred `tools/minio-local/` installer/provisioning work is also excluded: it was not operationally verified and is not needed by the accepted SeaweedFS adapter. The installed storage and external credential file remain unchanged.
