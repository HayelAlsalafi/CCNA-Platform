# Phase 9A — architectural approvals and owner-provided data classification

Recorded 2026-11-05 (Asia/Riyadh), branch `main`, against documentation checkpoint `442af6727271ba69a59a23cfb0d673425345561a`. Initial HEAD matched and the working tree was clean.

**Authority:** the owner's explicit instruction in this conversation, “The owner has approved all 18 architectural decisions” in [owner decisions](phase-9a-owner-decisions.md). This is a record of that approval, not an inference from source or database evidence.

**Approval status: 18/18 — APPROVED FOR ARCHITECTURAL DIRECTION ONLY.** Implementation, exact migration SQL, grants/RLS, seed/backfill mappings, role bootstrap, live verification, backup/restore execution and maintenance remain separately gated. Phase 9B has not started. **DATABASE CHANGES NOT AUTHORIZED.**

## Architectural decision register

The numbered recommendations, preservation rules, risks and approval boundaries in the decision document remain intact. Approval accepts the architectural direction; it does not turn deferred options into implemented capabilities or settle implementation-specific details that the recommendations explicitly leave for later review.

| Decision | Approved architectural direction | Status |
| --- | --- | --- |
| 1 | In-place hierarchy; Track is catalog organization, preserve the chapter/topic bridge. | APPROVED |
| 2 | Immutable course-version identity with dedicated taxonomy binding initially. | APPROVED |
| 3 | Protected canonical catalog and relational enforcement; no hardcoded CCNA course UUID in generalized CHECKs. | APPROVED |
| 4 | Preserve CCNA certification rules; separately model non-certification publication without invented verification claims. | APPROVED |
| 5 | Preserve topic/chapter IDs and references; scope imports; defer shared question placements. | APPROVED |
| 6 | Preserve CCNA-compatible routes and defaults; validate explicit context server-side. | APPROVED |
| 7 | Preserve historical snapshots/results; new scoped sessions and only proven legacy attribution. | APPROVED |
| 8 | Scoped assignments with a code-defined capability map, independent of purchase rights. | APPROVED |
| 9 | Least-privilege management functions and an explicit management-channel trust boundary; no broad assignment/audit writes. | APPROVED |
| 10 | Explicit owner bootstrap, transactional last-active-owner protection, anti self-escalation and mandatory audit. | APPROVED |
| 11 | Resource/action access policies and entitlements, not a course-only purchase boolean. | APPROVED |
| 12 | Preserve sign-in behavior initially; separately review preview and bounded active-session access semantics. | APPROVED |
| 13 | Preserve shared media objects; authorize accessible references and explicitly decide note/export access. | APPROVED |
| 14 | Preserve owner-private lesson RLS; no staff impersonation or implicit monitoring bypass. | APPROVED |
| 15 | Preserve controlled deletion safeguards; review each new dependency and future scoped destructive capability. | APPROVED |
| 16 | Version-pinned, explicitly covered grants/products; defer automated billing/subscriptions. | APPROVED |
| 17 | A dedicated post-0017 preparation/activation package, verified recovery evidence and separate execution gates. | APPROVED |
| 18 | Identity/scoping foundation first; separately gated authority/access work, preserved legacy identifiers and no Beta-readiness inference. | APPROVED |

Canonical detail remains in [decisions 1–18](phase-9a-owner-decisions.md), [design](phase-9a-multitrack-design.md) and [staged migration plan](phase-9a-migration-plan.md). This record does not replace their security requirements or authorize the alternatives they reject.

## Owner-provided data classification — not database-verified

The following statements are **OWNER-PROVIDED**, not independently verified record inventories. Exact UUIDs, counts, relationships, publication/eligibility state and the current database baseline have not been checked in this task. No database or storage connection was made, and no private receipt or backup was read.

| Data category | Owner statement | Required preservation / treatment | Verification status |
| --- | --- | --- | --- |
| Current questions | The current **16 questions** are the only content the owner considers real and worth preserving as approved content. | Preserve **all 16 and their related records**. Content classification does not itself change ACTIVE/DISABLED state, publication readiness or eligibility. | OWNER-PROVIDED; exact records/count and dependency closure REQUIRE LIVE VERIFICATION |
| Existing exam results | All existing exam results are experimental. | Retain results and their associated sessions/items, answers, grading, revisions, audit/recovery evidence and references. “Experimental” is not disposal permission. | OWNER-PROVIDED; exact records/count REQUIRE LIVE VERIFICATION |
| Currently published lessons | All currently published lessons are experimental and not approved as final learning content. | Preserve lesson/draft/revision records, publication pointers, media references and study history. The classification does not authorize unpublishing or changing visibility. | OWNER-PROVIDED; exact records/count REQUIRE LIVE VERIFICATION |
| All other data | No other data has been declared disposable. | Treat as preserved by default, including users, practice history/deliveries, notes, highlights, bookmarks, progress, taxonomy, media metadata and stored objects. Do not infer a cleanup scope. | Classification otherwise UNKNOWN; exact inventory REQUIRES LIVE VERIFICATION |

**Experimental data must not be deleted, reset, rewritten, or published/re-published as final content without separate explicit approval.** No removal, visibility change, media cleanup, anonymization, migration backfill or test-data recreation is authorized by this label. Existing experimental records are not available as destructive test fixtures.

Preservation of the 16 real questions includes their original IDs/codes, text, answer options and correctness, explanations, references/media where present, chapter/topic/domain bindings, immutable revisions and any records needed to preserve referential integrity or historical evidence. Associated experimental exam history is still preserved. The complete dependency set must be enumerated read-only before any later authorized change; this document does not certify which related rows currently exist.

No content has been translated, rewritten, regraded, enabled, disabled, published or unpublished. No other data is assumed disposable. A future cleanup proposal would need an exact reviewed record set, dependency analysis, recoverable backup, risks, rollback/recovery assessment and its own owner approval.

## Next prerequisite — post-0017 backup verification and isolated restore rehearsal

Before any Phase 9 database-change approval, establish recovery evidence for the **current post-0017 state**, preserving all data categories above. This prerequisite is documented, **not executed or authorized for execution by this record**.

1. Prepare/review a compatible post-0017 guarded workflow under a separate source-preparation authorization. Existing 0017 activation tools expect a pre-0017 baseline and must not be run by bypassing their pins (`tools/exam-activation/readiness.mjs:28,44`; `backup.mjs:27,62`; see [plan S0–S1](phase-9a-migration-plan.md)).
2. Obtain separate authorization for a main read-only preflight, backup work and an identified disposable restore target. Verify actual cluster identity, ordered ledger/schema, owners, grants, RLS, revision/deletion guards and the exact question/dependency inventory. Do not treat historical counts or owner classification as a live verification receipt.
3. Verify a complete, current post-0017 backup and its archive checksum/readability, coverage, UTC row fingerprints, sequences and security metadata. If no eligible backup exists, creating one requires separate authorization; do not silently reuse the old pre-0017 archive or create another backup here. Preserve all older backups.
4. Restore only into an independently verified isolated disposable database/cluster, never main. Compare all original data and relationships, including the 16 owner-designated questions and all experimental/otherwise unclassified records. Verify restored role mapping, permissions, RLS, immutable revisions and controlled deletion protections.
5. Retain sanitized recovery evidence outside Git. Stop on any mismatch. A successful restore is a prerequisite, not approval to apply a migration. Any later migration rehearsal and main activation require their separately reviewed packages and explicit execution authorization.

**Current recovery status: REQUIRES LIVE VERIFICATION.** No backup, restore or rehearsal was executed here. There is no new migration or approved data-mutation mapping.

## Status boundaries

- Phase 9A architectural decisions: **18/18 APPROVED**.
- Data classification: **RECORDED AS OWNER-PROVIDED; NOT DATABASE-VERIFIED**.
- Phase 9B implementation: **NOT STARTED / NOT AUTHORIZED BY THIS RECORD**.
- Database changes: **NOT AUTHORIZED**.
- Live preflight, backup and isolated restore: **PENDING SEPARATE AUTHORIZATION AND VERIFICATION**.
- Public Beta: **NO-GO**; architectural approval and content classification do not establish deployment readiness.
