# Safe lesson deletion — implementation

2026-11-01. **Source implementation complete; main activation BLOCKED pending separate approval.** Migration 0016 is proposed, unregistered and unapplied. No real lessons, learner records, media metadata or S3 objects were changed. Official source remains at 15 migrations; official journal SHA-256 remains `de08a3729f3687d870a1e90b24dadc286c54ca3f35024dc237923b02061e121b`. All 15 applied SQL checksums still pass the existing manifest validator.

## Rules and API

`DELETE /api/admin/lessons/:id`, JSON `{ "version": 3, "confirmationTitle": "Exact current title" }`, returns `{ "id": "…", "deleted": true }` only after successful transactional verification. Existing Clerk authentication, database Admin authorization and Admin-session mutation middleware protect the route. The actor is taken from the authenticated database user, never the request body. The SQL function independently requires an ACTIVE ADMIN and locks that user's record.

Only a never-published draft without dependencies is eligible. The function locks the lesson, validates its version and exact title, and blocks:

- A current published revision (`published`).
- Any learner progress (`progress`).
- Any notes, highlights or bookmarks (`annotations`).
- Any historical revision, including unpublished former publications (`revisions`).
- A UUID mention in other lesson blocks or any published snapshot (`content_reference`), including case/percent-encoded URL characters. This is deliberately conservative: even an incidental UUID mention blocks deletion and needs human review.
- Any unreviewed inbound foreign key, including an empty CASCADE dependency (`unknown_dependency`).

Published revision immutability and foreign keys remain enabled. Only the one eligible `lessons` row is deleted; structured blocks disappear with that row. There are no separate draft-owned dependent rows that need deletion in this architecture. No revision/history/media cleanup is attempted. Shared images and all S3 objects remain untouched and reusable.

JSON references have no FK. The function therefore briefly obtains SHARE ROW EXCLUSIVE locks on lessons/revisions before scanning references; concurrent authoring writes wait. The API has five-second lock and fifteen-second statement limits. No automatic retry occurs. Concurrent deletion produces one success and a not-found/conflict response for the competing request. New links authored after deletion are outside this operation's reference snapshot; no existing reference is silently rewritten.

The API invokes only the controlled function inside a transaction and validates its result before commit. An invalid response or failed safety check rolls back. Missing activation returns `503 LESSON_DELETE_NOT_READY`; protected categories return 409 with a category-specific explanation; stale versions/locks/FKs return conflict; missing lessons return 404; non-admin callers return 401/403. No direct DELETE grant is introduced.

## UI

Every lesson card has Delete beside Edit / preview. The existing Radix alert dialog shows the exact title, warns about permanent deletion and preserved history/media, and requires typing the title. Published lessons show a blocked explanation with submission disabled. A synchronous ref latch prevents duplicate requests; loading disables dismissal/submission; failures remain visible without losing the confirmation. Session capture prevents stale account responses affecting the UI. Verified success refreshes existing lesson queries. Refresh failure clearly distinguishes an already completed deletion and prevents resubmission. Keyboard focus returns to the card action or library heading.

## Proposal and startup integration

Proposal: `lib/db/drizzle/proposed/0016_safe_lesson_deletion.sql`.

- SQL SHA-256: `7a64aaaf5fc40e117a7aad2f11682d3fa8426673f17277c77009d19606dd0116`.
- Journal timestamp: `1793145600002`.
- Snapshot SHA-256: `e1adea7776037905d9b5b2528f3ac596fb368688fc062e918a66bee13514629a`.
- Journal SHA-256: `05bea46c44e9671d60939019602d6218e050052a15089e4dcc3a1e8b910274eb`.

The proposal creates one SECURITY DEFINER function with fixed `search_path=pg_catalog`, revokes PUBLIC execution and grants only EXECUTE to `ccna_phase6a_app`. Its owner must be the existing migrator/table owner. Existing runtime assertions still require DELETE/TRUNCATE=false on lessons and revisions. The new guard checks exact function body, owner, language, return type, definer setting, search path, exclusive non-grantable owner/app EXECUTE ACLs and absence of overloads.

The proposed snapshot preserves all 22 tables and their definitions. Only a separately approved exact 16-entry source promotion enables the new startup branch. Current 15-entry startup remains supported. No official journal, snapshot or applied migration was edited; no activation executor is introduced or run in this task.

## Verification

- **9 focused API/service and DOM tests PASS**: transactional function call, fail-closed readiness, invalid-result rollback, dependency categories, concurrency/error mapping, invalid input, actual Admin middleware, explicit confirmation, duplicate prevention, success refresh, blocked and published states.
- **2 focused startup tests PASS**: source-copy-only 16-entry promotion with the same 22 tables; wrong checksums/counts rejected; exact function body/ACL/search-path/owner/overload checks. Real source stays at 15.
- **Isolated PostgreSQL fixture PASS**, private `127.0.0.1:55440`, system `7695735287099484548`, database `ccna_lesson_delete_0016_4299210e385a4d58be08029c`. Real function executed against synthetic records using the actual 0013–0015 table/trigger definitions. Verified eligible deletion, published/history/progress/annotation/link/encoded-link blocking, actor/version/title denial, rollback, unknown CASCADE dependency rejection and concurrent requests. Fingerprints of users, chapters, revisions, progress, annotations and media remained identical. No storage adapter was called. Temporary private HBA was restored byte-for-byte.
- Receipt: `.local/lesson-deletion/ccna_lesson_delete_0016_4299210e385a4d58be08029c/rehearsal.json`. A preceding fixture attempt stopped with 23502 because its progress row omitted required `state`; the fixture was corrected to IN_PROGRESS without relaxing any constraint. Both disposable databases were retained.
- TypeScript PASS (`node tools/check-admin.mjs`); production compilation PASS (`node tools/build-admin-ui.mjs`), artifact `.local/admin-ui-production-build/1793481959154`. Existing sourcemap/large optional-chunk warnings remain. Focused diff checks PASS. Impeccable's scoped detector returned no findings.
- No authenticated browser acceptance or main-database deletion was performed. The database fixture uses the existing private owner and a built-in fixture grantee; it does not prove the main role configuration or replace the required activation rehearsal.

## Files

- API: `artifacts/api-server/src/lib/lesson-delete.ts`, `lesson-delete.test.ts`; `src/routes/lessons.ts`.
- UI: `artifacts/ccna-learning/src/components/admin-lessons.tsx`, `lesson-delete-control.tsx`, `lesson-delete-control.test.tsx`.
- Proposal: SQL above; `lib/db/drizzle/proposed/meta/0016_snapshot.json`, `0016_journal.json`.
- Guards: `tools/lesson-deletion/policy.mjs`; `tools/phase6a-local/{policy,upgrade,run}.mjs`; `tools/study-activation/{proposal,proposed-runtime-guard}.mjs`; `tools/media-activation/{proposal,runtime}.mjs`.
- Tests/tooling: `tools/lesson-deletion/{policy.test,rehearse}.mjs`, `tools/run-lesson-delete-tests.mjs`; this report and the separate activation checklist.

After separately approved database activation, restart the API through its guarded launcher; refresh/redeploy the frontend as appropriate (Vite may already hot-load the UI). No service restart was performed here. Until activation, the new endpoint intentionally returns 503 rather than pretending deletion works. See `safe-lesson-deletion-activation-checklist.md`.
