# Permanent Admin Delete — correction and history migration proposal

Historical record of the earlier history-preserving proposal. The user's subsequent FINAL LEGACY DATA REMOVAL authorization and the implemented controlled history-deletion workflow supersede its unconditional pilot guard and fixture-retention policy. See [the current execution and Admin workflow](final-legacy-removal.md); the historical registry proposal below has not been implemented.

Implementation workspace: `<repository-root>`, branch `main`, HEAD `03b1452`. This correction supersedes the previous archive fallback. It adds no schema migration and executes no application-data deletion or history change.

## Implemented behavior

The existing ADMIN-only single and bulk endpoints now return only DELETED or BLOCKED. Neither a blocked question nor a blocked topic receives a status/timestamp UPDATE. Topic deletion never removes questions implicitly.

DELETED means DELETE returned exactly the selected UUID, a follow-up SELECT found no row, and the service transaction completed. Only mutable question-objective links and existing cascading question options may be removed with the selected question. Revisions, deliveries, attempts and historical topic references are never removed. Unexpected failures roll back the batch; individually blocked items use savepoints.

For questions, BLOCKED reports exact counts of `revisions`, `deliveries` and `attempts`. For topics, it reports `active_questions`, `other_questions`, `attempts` and `revision_snapshots`. A concurrent FK/RESTRICT error includes its SQLSTATE and sanitized constraint name when supplied by PostgreSQL. Missing privileges and lock conflicts are reported separately. Absence of reliable dependency evidence fails closed.

`pilot-content-protection.ts` pins the 60 original Sprint 7 question UUIDs and 24 required topic UUIDs from the committed cleanup preservation report. Those UUIDs are always BLOCKED, regardless of status or renamed metadata. Inputs are case-normalized and case-insensitive duplicate identifiers are rejected. No pilot row was deleted, disabled, renamed or republished by this correction.

The existing Admin selection/confirmation controls now describe permanent deletion and blocking, display only DELETED/BLOCKED results, and retain catalog/list/counter invalidation after server processing. Before sending DELETE, the UI checks the authenticated ADMIN-only `/api/admin/{questions|topics}/delete-policy` capability (`permanent-only-v1`) and its still-current session. A stale archiving API is refused before sending a deletion request, and an unsupported ARCHIVED result is never accepted as success. Existing authentication, database-authoritative ADMIN authorization and session checks remain unchanged. Add/Edit, Practice and Exam Simulator behavior are not redesigned in this correction.

## Which existing records are removable?

Evidence is the committed Phase 8A.1 report and its independently decoded, hash-verified backup, not a new live application catalog query. The exact reviewed IDs and per-record counts are in `.local/phase8a-retention-review.json` and the [retained-content review](phase-8a-1-retained-content-review.md).

| Reviewed record group | Count | Permanent-delete eligibility |
| --- | ---: | --- |
| Original Sprint 7 pilot questions | 60 | BLOCKED by explicit protection policy |
| Required pilot topics | 24 | BLOCKED by explicit protection policy |
| Legacy questions with revisions | 74 | BLOCKED by immutable revision/history references |
| Legacy question CCNA-Q-000002 | 1 | BLOCKED by two older attempts, despite having zero revisions |
| Extra legacy topics | 78 | BLOCKED by current question and/or historical references |

Among the 78 extra topics, 75 have current questions, 77 appear in revision snapshots and 41 have direct attempts; these sets overlap. The three without current questions still have historical references. The 75 legacy questions collectively reference 163 revisions, 99 deliveries and 53 attempts. **The reviewed inventory has zero safely removable nonpilot questions/topics.** No existing record is claimed physically deleted during this task. Future/current records absent from this reviewed inventory are classified from current database evidence when an Admin explicitly requests deletion.

An empty, unreferenced nonpilot topic is removable. A nonpilot question with no revisions/deliveries/attempts is removable with its mutable options/objective links. Standard question creation currently captures an initial immutable revision, so even a never-practiced new draft normally remains BLOCKED. An initial revision is not silently discarded as "unused".

## Proposed separate migration — NOT IMPLEMENTED OR EXECUTED

Goal: allow explicitly selected, nonpilot catalog parents to leave `questions`/`topics` while preserving all historical identifiers, snapshots, scores, deliveries and attempts. This requires changing the history model; ignoring errors, disabling triggers or dropping history is not acceptable.

The smallest coherent design is immutable identity registries plus a preserved catalog payload for retired parents:

1. Add immutable `question_identities` and `topic_identities` tables containing stable UUIDs and metadata required to label history. Backfill all existing referenced identities, including identities of still-active content, without modifying active question/topic rows. Existing UUIDs and question codes are retained; allocation rules must prevent reuse.
2. Before removing any selected nonpilot parent, preserve its full current question/options/topic payload in an immutable historical catalog store. Mark that payload **current-at-removal**, not an invented submission-time snapshot. This is especially necessary for CCNA-Q-000002, whose older attempts have no verified revision. Its original submission-time content cannot be reconstructed honestly from current content.
3. Repoint revision-to-question and attempt-to-question/topic foreign keys to the immutable identity registries. Keep revision/delivery/attempt composite bindings, IDs, scores and existing JSON snapshots unchanged. Add and validate the replacement RESTRICT FKs before removing their old active-table FK definitions, all inside the approved versioned migration transaction. No interval with unprotected history is permitted.
4. Preserve the ACTIVE `questions.topic_id -> topics.id` RESTRICT relationship and mutable option/objective-link behavior. A topic still requires separately selected question removal first. All 60 pilot questions and 24 required topics remain in their active tables and retain the deletion guard.
5. Update history reads to resolve identifiers/labels from identity records or the preserved payload if active parents are absent. Preserve LEGACY_UNVERIFIED semantics for attempts lacking original snapshots. Update creation/revision capture to register new identities atomically; review schema export, Drizzle metadata, guarded inventory and narrowly scoped runtime privileges for the added tables.
6. Only after that migration and API compatibility are verified may a separately approved removal transaction preserve payloads and permanently delete an explicit list of nonpilot catalog parents. It must not bulk-delete "all disabled" records or include any pilot ID.

### Impact requiring approval

- New schema tables and backfilled identity/payload rows; existing history data is not rewritten or deleted.
- Replacement of specific active-parent FK targets with validated immutable identity targets. This is a real versioned schema change, not an exception to existing constraints.
- History fallback/read and new-content creation changes, schema/inventory updates and reviewed privileges for new immutable stores.
- Based on the reviewed snapshot, catalog scope could eventually remove up to 75 nonpilot questions and 78 extra topics while retaining their history. Actual impact must be recalculated from a fresh guarded inventory and an explicitly approved ID set before execution. No current removal is authorized by this proposal.
- The existing 60 pilot rows and 24 topic rows remain byte-for-byte unchanged. All six domains, 33 navigation chapters and taxonomy records remain intact.
- Backup/restore rehearsal, identity/FK/history fingerprints, legacy review correctness, concurrent delivery/grading and runtime authorization tests are required before promotion. A failure must roll back; recovery must not overwrite subsequent learner progress automatically.

No migration SQL, Drizzle journal entry, registry tables, privilege changes or history-row modifications were created/executed for this proposal. It requires presentation/review and **separate explicit approval** before implementation/execution.

## Validation and activation

340 database-free tests passed across 28 files; 5 PostgreSQL fixture tests passed against only `ccna_drizzle_check_20261012_c08f12ad34b6` on `127.0.0.1:55440`. Physical deletion was verified with SELECT absence checks inside isolated fixture transactions, including deleted options/objective links. BLOCKED rows' entire question/topic records, status, timestamps and revision history remained unchanged. Test transactions rolled back; the ledger stayed unchanged and HBA was restored byte-for-byte. No application database or populated rehearsal database was connected to by the tests. Only the disposable test database's sequence may advance.

TypeScript, production compilation and final diff checks passed. Compilation wrote only `.local/admin-ui-production-build/1791960784094`, with existing UI source-map warnings; no deployment or authenticated browser rendering was claimed. No live signed-in browser mutation is claimed.

Restart the existing API normally to load this correction; the old process will otherwise retain the former ARCHIVED behavior. Stop the owning API terminal with Ctrl+C, then:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
```

Restart/refresh the frontend as appropriate:

```powershell
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

Use existing private credential prompts. Do not run a migration, cleanup, seed, reset or grant to activate this correction. The previously approved two-table DELETE grant remains sufficient for dependency-free permanent deletion.

Modified source/tests: `artifacts/api-server/src/lib/admin-delete.ts` and its tests; new `pilot-content-protection.ts`; Admin delete controls and tests; question/topic Admin routes and tests for their policy capability; `tools/admin-practice-disposable.db.test.ts`; this review and updated Admin/Practice documentation. Existing migration SQL/metadata, grants, runtime policy, Practice and unrelated application code were preserved.
# Current universal deletion follow-up

The implementation in [question-bank-migration-and-universal-deletion.md](question-bank-migration-and-universal-deletion.md) supersedes this historical revision-blocking/pilot-protection policy. It adds explicit history-loss confirmation, controlled physical deletion and shared-session tombstones for any selected question, including original pilot questions. Migration 0010 and its prerequisites await separate application activation approval; no actual question deletion was executed during implementation.
