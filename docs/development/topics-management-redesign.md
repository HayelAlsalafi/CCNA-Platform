# Topics management

The `/admin/topics` page uses bounded PostgreSQL-backed management endpoints. No database migration, permissions change, content import or cleanup is required. Existing topic IDs, questions, taxonomy records, curriculum configuration, attempts and revisions are unchanged by deployment.

## Implementation files and validation

Created:

- `artifacts/api-server/src/lib/topics-management.ts` and its database-free unit tests.
- `artifacts/ccna-learning/src/components/topics-manager.tsx`, `topic-editor.tsx` and `topics-manager.test.tsx`.
- `artifacts/ccna-learning/src/lib/topic-form.ts` and `src/topics-management.css`.
- `lib/api-client-react/src/topics-management.ts` and this document.

Updated:

- Admin Topics route registration and route authorization tests.
- Existing `admin-topics.tsx` exports to use the new manager without changing its caller.
- Shared deletion controls with optional dependency previews and bounded cross-page selection; existing question-manager behavior remains the default.
- Admin session regression tests for drawer interactions and the new additive endpoints.
- API-client type exports, the offline curriculum test inventory and the existing guarded disposable fixture test source.

Validation performed on October 14, 2026:

- **419 tests passed**, 33 database-free suites, including create/edit, slug collisions, search, pagination, filters, bulk visibility, dependency previews, deletion authorization and session/data-preservation regressions.
- API, frontend, schema and API-client TypeScript checks passed.
- Production build passed: `.local/admin-ui-production-build/1791987004762`. Existing Radix source-map location warnings were nonfatal.
- Tracked-file diff whitespace checks passed; disposable runner plan mode reported zero database operations.
- Follow-up during Question Bank Studio verification: the Topics PostgreSQL fixture group **PASSED** in the existing disposable Drizzle-check database, including physical removal of an unreferenced synthetic topic and dependency-blocked retention. All fixtures rolled back and HBA was restored byte-for-byte. No application-database connection or write, service restart, migration, grant or cleanup was performed. Browser visual/live endpoint verification was not performed.

## Interface

- Search names, slugs and descriptions with literal matching, debounced for 300 ms. The current topic schema has no separate topic code.
- Choose 10, 25 or 50 rows; sort by name, display order, status, creation date or update date. Table and compact cards share the same server page.
- Searchable filters distinguish curriculum domains/chapters from versioned taxonomy domains. Curriculum relationships come from reviewed exact-slug bindings; objective relationships come through question assignments. Neither is guessed or automatically rewritten.
- **Add topic** opens a reusable drawer. Row **Actions → Edit topic** uses the same validated form. Automatic slugs are checked on the server again during creation, with bounded collision retries. Manual slugs remain supported. Slug and order are optional advanced settings.
- Changing a mapped topic slug requires explicit acknowledgement because it may remove its reviewed chapter binding. Dynamic chapter editing is not supported by the existing storage model; do not invent relationships in descriptions.
- Escape, outside click, Cancel and browser navigation warn about unsaved changes. Saving locks the drawer; errors retain the draft. Drawer/modal focus is managed by the existing Radix components.
- A topic name or **Actions → View details** opens metadata, counts, chapters, objective references and ten linked questions per page. **Manage related questions** opens the existing filtered question manager.
- Selection persists across pages, page sizes and sorts, up to 500 records. **Select all** means only the current page. Changing search or relationship/status filters clears selection. Selected IDs and their observed versions are retained, rather than loading every topic.
- **Enable selected / Disable selected** requires confirmation listing names and question counts. These operations change topic visibility only. They do not publish, disable or delete questions.
- **Permanently delete / Delete Selected** first loads batched dependency evidence, then requires confirmation. Preview failure prevents the deletion request. The existing permanent-only policy check and controlled deletion service recheck dependencies at execution. Topics containing any questions or protected history remain **BLOCKED**; successful records are **DELETED** and verified absent by that service. No implicit child deletion or archival occurs.
- Successful writes invalidate the current Admin session's queries and affected learner catalog projections; totals and lists refetch immediately. No account's response or private draft carries into another session.

## Additive API

All paths below are under `/api/admin/topics`; existing legacy endpoints retain their contracts. Clerk authentication, the database ADMIN role/status and Admin mutation-session checks apply to every new endpoint.

| Method/path                          | Contract                                                                                                                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/manage`                        | `page`, `pageSize`, `search`, `status`, `domain`, `chapter`, `taxonomyDomain`, `sort`, `direction`; returns `items`, filtered `total`, effective page metadata and unfiltered status totals. |
| GET `/manage/metadata`               | Reviewed curriculum filter options and versioned taxonomy domains; no answer data.                                                                                                           |
| GET `/manage/slug-suggestion?name=…` | Bounded unique-slug suggestion, advisory until creation.                                                                                                                                     |
| POST `/manage`                       | Existing topic fields plus optional boolean `autoSlug`. Returns created topic.                                                                                                               |
| GET `/manage/:id?questionPage=1`     | Topic metadata, exact edit version, bounded question summaries and distinct objective references. No answer choices, correct answers or explanations.                                        |
| PATCH `/manage/:id`                  | Existing editable fields plus exact `expectedVersion`; optional boolean `acknowledgeChapterChange`. Stale/removed/mapping-unacknowledged topics return 409.                                  |
| POST `/manage/deletion-preview`      | `{ids}` (1–500 distinct UUIDs); names, question/publication counts, attempts, revision-snapshot counts, eligibility and missing IDs. Advisory only.                                          |
| POST `/manage/bulk-status`           | `{status,items:[{id,version}]}`; per-record `UPDATED`/`BLOCKED`, aggregate counts. Sorted locks, statement/lock timeouts and exact-version comparison.                                       |

List metadata and rows use one read-only repeatable-read transaction with two aggregate SQL queries. Counts and objective summaries are restricted to the bounded page. All user search/filter values are bound parameters; sort identifiers come from a fixed allowlist. Details use bounded queries, not N+1 expansion. Exact six-digit UTC timestamps preserve PostgreSQL microsecond precision for concurrency checks; updates advance the version even if the clock returns the same instant.

No migration or new dependency is needed. At much larger catalogs, profile substring-search query plans before considering an additive search index; the current implementation does not return the entire dataset to paginate it.

## Local verification

Do not rerun any cleanup. If the old services are still running, use Ctrl+C in their own terminals, then restart them to load the new API source.

API terminal:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
```

Frontend terminal:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

Use the existing hidden credential prompts locally: application-role password, migrator password for SELECT-only ledger verification, and existing Clerk development keys. Do not paste credentials or change database permissions.

Open `http://localhost:8080/admin/topics` while signed in as ADMIN. Verify the existing 24 topics, use search/filters/sorting/page sizes/cards, and inspect a topic's details and related question link. Opening or cancelling a form/confirmation makes no content writes. Never use the protected pilot records for destructive testing.

Offline checks (installed tooling only):

```powershell
node tools/run-curriculum-tests.mjs
node tools/check-admin.mjs
node tools/build-admin-ui.mjs
```

The build produces an isolated `.local/admin-ui-production-build/…` artifact, not a deployment. Browser visual inspection and application-database mutation tests are separate from these offline checks. The optional guarded fixture test uses only the named disposable Drizzle-check database, rollback-only transactions and restored HBA policy; it requires authorization for its temporary cluster configuration change.
