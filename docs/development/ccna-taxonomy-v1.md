# CCNA Taxonomy v1 — Design Proposal

Status: Phase 1.2 source foundation implemented; database migration PROPOSED, NOT APPLIED
Baseline: main / 03b1452
Target exam: Cisco CCNA 200-301 v1.1

## Principles
- Preserve existing topic, question, and attempt IDs.
- Use versioned exam blueprints.
- Support multiple objectives per question.
- Mark legacy content as unclassified until reviewed.
- Never auto-publish imported content.
- Keep existing single-answer practice compatible.
- No destructive migrations or automatic seed.

## Classification entities
1. `exam_blueprints`: UUID, exam code, version, title, DRAFT/ACTIVE/RETIRED metadata status, source URL, verification timestamp, creation timestamp. Exam code/version pairs are unique. New rows default to DRAFT; ACTIVE requires explicit source verification. Blueprint status does not activate or publish questions.
2. `exam_domains`: UUID, blueprint FK, domain code, name, integer weight (1–100), nonnegative order. Domain codes are unique per blueprint. A complete proposed domain set must total 100% in the pure validator; incomplete draft rows are permitted by the database.
3. `exam_objectives`: UUID, domain ID, blueprint ID, domain code, stable objective code, nonblank description, nonnegative order. A composite FK binds all three domain identifiers; a CHECK binds the objective code prefix to its domain. Objective codes are unique per blueprint, including across domains. Codes such as `1.1`, `1.10` and `1.1.a` are supported.
4. `question_objectives`: existing question ID, objective ID, blueprint ID, primary flag (defaults false). The question/objective pair is the primary key. The composite objective FK prevents spoofing a blueprint to evade primary uniqueness. A partial unique index on `(question_id, blueprint_id) WHERE is_primary` enforces at most one primary even under concurrent writes. Zero primary mappings is valid; separate blueprints can each have a primary.

All taxonomy foreign keys use RESTRICT. Composite identity UNIQUE constraints provide FK targets; indexes support blueprint/domain ordering, objective-to-question lookup, and question classification lookup. No columns, IDs, foreign keys, answer options, or enums on existing content/history tables are altered.

### Domain contracts and future writes

`lib/db/src/schema/exam-taxonomy-validation.ts` exports strict Zod v4 input validators. UUIDs are canonicalized to lowercase, unknown fields are rejected, and classification sets reject duplicates and competing primaries. `validateQuestionObjectiveAssignments(input, objectives)` also verifies objective/blueprint membership against an explicitly supplied catalog. It performs no I/O or persistence. It checks the supplied set; database constraints remain necessary for existing rows and concurrent transactions.

Future ADMIN write services must load authoritative catalog rows, validate a complete intended assignment set, and write transactionally. Removing a primary before promoting another must happen in the same transaction because the unique index is immediate. Full catalog verification, version immutability, classification audit history and API authorization belong to the management phase. ACTIVE metadata and `verified_at` record an explicit review assertion, not proof of question coverage or content quality.

### Verified reference inventory

On 2026-10-12, the [official Cisco v1.1 PDF](https://learningcontent.cisco.com/documents/marketing/exam-topics/200-301-CCNA-v1.1.pdf) was checked for its version, six domain weights, 53 top-level objective codes and 58 lettered subobjective codes. `ccna-200-301-v1-1.ts` holds this read-only inventory with source and verification date. Its short local labels are navigation summaries; full objective descriptions are **PENDING_VERIFICATION** and are not claimed to be a complete official text catalog. The inventory is not a seed and supplies no database IDs, question assignments or activation action.

| Domain code | Domain | Weight | Top-level codes |
| --- | --- | --- | --- |
| 1.0 | Network Fundamentals | 20% | 1.1–1.13 |
| 2.0 | Network Access | 20% | 2.1–2.9 |
| 3.0 | IP Connectivity | 25% | 3.1–3.5 |
| 4.0 | IP Services | 10% | 4.1–4.9 |
| 5.0 | Security Fundamentals | 15% | 5.1–5.10 |
| 6.0 | Automation and Programmability | 10% | 6.1–6.7 |

[Cisco's exam refresh notice](https://blogs.cisco.com/learning/stay-on-track-get-certified-before-the-ccna-refresh) identifies v1.1 as available through 2027-02-02 and v2.0 testing from 2027-02-03. Future versions receive separate blueprint identities and independently reviewed catalogs; v2.0 coverage is not implemented here. Code-inventory completeness does not establish classified question-bank coverage.

## Compatibility
- Existing topics remain learner practice groups.
- Existing questions retain their topic_id.
- Existing attempts and revision references remain unchanged.
- Classification is optional for legacy questions.
- No automatic classification based on topic names.

The historical Phase 6A audit is not the implementation baseline. Current schemas already export `question_revisions` and `practice_deliveries`; migration `0004_question_revisions` is already journaled. Their immutable snapshots and existing nullable legacy attempt bindings are preserved. Classification is attached to the logical question, not to a revision: future coverage reports cannot reconstruct historical classification changes from this foundation alone.

Existing single-answer create/update contracts remain strict and unchanged; they neither require nor accept taxonomy fields. New Admin-only taxonomy and import routes are documented in [Admin taxonomy and bulk import](admin-taxonomy-and-import.md); learner projections are unchanged. Practice eligibility still uses existing question/topic status and delivery/revision behavior, without taxonomy joins or answer-bearing taxonomy fields. With no mappings a legacy question is unclassified. Migration 0005 creates no mappings.

## Delivery phases
A. Schema and classification contracts.
B. Admin classification management and tests.
C. Question quality and duplicate detection.
D. CSV/XLSX staged import.
E. Review, publication, and coverage analytics.

## Acceptance criteria
- Six blueprint domains represented.
- Objectives identified by stable codes.
- Legacy questions and attempts preserved.
- No learner answer leakage.
- No database writes before separate approval.

## Implementation boundary
Phase 1.2 originally authorized source changes and database-free tests only. The later Admin delivery adds protected taxonomy management and confirmed draft import, and separately approved disposable migration verification. Application-database migration, seeds, live classification/publication, Git commits and remote changes were not performed. See the delivery report for current authorization and deployment boundaries.

### Promoted migration and separate deployment approval

`lib/db/drizzle/0005_exam_taxonomy.sql` is now the official, journaled migration. It preserves the rehearsed proposal byte for byte and contains only CREATE TYPE, CREATE TABLE and CREATE INDEX statements for taxonomy, without DML, existing-table changes, backfill, deletion or seed. The proposal copy remains as immutable rehearsal provenance; its historical header is not the current execution status. The journal contains entries 0–5. Snapshot `0005_snapshot.json` links to `0004_snapshot.json`, preserves every existing object and adds only the taxonomy enum/four tables.

All nine SQL rehearsal groups passed on the second disposable database. With separate user approval, the actual Drizzle migrator then applied all six official migrations in a new database within that same private cluster and repeated with no ledger/schema-column/sequence changes. Both populated rehearsal databases were preserved. See [the delivery report](admin-taxonomy-and-import.md) for exact scope and remaining application-role/deployment checks. The application development database has not been migrated. Do not run `push` or regenerate over handwritten history.

Database catalog population and classification of reviewed questions require separate approval even after schema deployment. Do not set `verified_at` merely because codes exist: verify the intended descriptions and catalog scope first. No questions should be created or published during taxonomy population.

### Safe validation

- New Vitest files: `artifacts/api-server/src/lib/exam-taxonomy.validation.test.ts` and `exam-taxonomy.schema.test.ts`. They import `@workspace/db/schema`, never the database entry point or migration config.
- Validation tests cover code formats, domain binding, metadata validation, aggregate weights, duplicate mappings, primary uniqueness per blueprint, catalog membership, canonical UUIDs, empty classifications, catalog counts and old single-answer contracts.
- Static tests inspect Drizzle metadata and official SQL for columns/types/defaults, keys, checks, FKs, indexes, partial primary uniqueness, additive-only statements, correct journal placement and preservation of historical snapshot objects.
- Relevant existing tests cover single-answer validation, immutable delivery grading, history DTOs and learner practice routes. Select explicit unit files; never include `*.db.test.ts` or `*.integration.test.ts` for this task. The existing default API config does not exclude every database test file.
- Historical Phase 1.2 results are recorded in [Phase 1.2 validation](phase-1-2-taxonomy-validation.md). Current Admin tests, isolated migration evidence and remaining toolchain/deployment limitations are recorded in [the delivery report](admin-taxonomy-and-import.md). No application migration or seed was run.
