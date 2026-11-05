# Phase 9D — content access foundation (partial source)

Built on the uncommitted Phase 9C tree, `main` at
`debda491d157fb56a792daafa6a11206e0428303`. Phase 9C files were retained.
**SOURCE PARTIAL. DATABASE ACTIVATION NOT AUTHORIZED.** No content, user,
history, role, grant or policy record was created or changed. No DB/storage
connection, backup, restore, migration, service change or Git mutation occurred.

## Prepared source

- `lib/db/src/schema/content-access.ts` and unregistered
  `lib/db/drizzle/proposed/0021_content_access.sql`: typed resource policies
  referencing real course/version/lesson IDs, revision-bound previews, direct
  manual entitlements, validity windows, revocation metadata, unique request
  IDs and RESTRICT FKs. No seed, existing-row rewrite or application table write
  grant. Resource identity is immutable; entitlement payload is retained with
  one-way revocation. No role assignment creates an entitlement.
- `src/lib/content-access-policy.ts`: pure default-deny evaluator with injected
  clock, ACTIVE actor/catalog/publication checks, typed actions, exact resource
  and user matching, expiry/revocation checks. OWNER/ADMIN/CONTENT_MANAGER are
  never purchase evidence. Unknown/malformed/unmapped context denies access.
- `src/lib/content-access.ts`: centralized async `canAccess(actor,resource,action)`
  and injectable reader. Enabled reads use only a narrow, fixed-search-path
  definer function. Missing tables/permissions/errors deny access, never fall
  back to legacy. Authenticated legacy compatibility is a no-op while disabled;
  it does not replace existing Clerk, ACTIVE-user, publication, ownership or RLS
  checks. The API must supply its verified local user, never a request-body actor.

The proposed read function returns only the requested policy and that actor's
direct grants, resolves lesson → chapter → version → course → track and validates
blueprint/publication bindings. Runtime app gets function EXECUTE only, not
SELECT/INSERT/UPDATE on entitlement tables. This still trusts the API-supplied
actor UUID; PostgreSQL does not independently verify Clerk sessions. Exact owner,
body, ACL/default ACL and role memberships require isolated verification.

## Preview and grant boundaries

FREE_OPEN allows only explicitly listed actions, still requiring sign-in.
FREE_PREVIEW allows metadata and, for a lesson only, an explicitly approved
**whole published revision** with `preview_revision_id` equal to the current
published revision. Republishing invalidates full preview until separately
approved. Metadata preview never permits a full body, media, practice or exam.
There is no partial-block/excerpt endpoint and no browser-only hiding of paid
content. ENTITLED requires a valid direct grant for the exact action/resource.

Initial grants do not inherit: a free course cannot override a paid lesson;
course/version grants are not automatically lesson grants or future-edition
rights. A later reviewed issuer can materialize explicit per-resource grants
with captured coverage instead of deriving rights from a mutable current bundle.
No product, billing, subscription or automatic coverage expansion is implemented.
The exact entitlement metadata/audit/coverage issuance workflow remains pending.

## Approved expiry decision and implemented personal-study projections

The owner subsequently approved: after entitlement expiry, users may view/export
their original notes and personal progress, but not paid lesson bodies, protected
media or quoted paid excerpts. Preserve all underlying records. This resolves the
earlier note/export product decision; it does not authorize database activation.

Implemented in `private-study-access.ts` and the enabled branches of `study.ts`:

- Existing actor-scoped read-only transactions and `app.study_user` remain intact.
  Workspace reads owned annotations without requiring current publication, so
  unpublished/older references do not make personal notes disappear. Stored rows
  are never redacted or rewritten; presentation is projected with an explicit
  field allowlist. No snapshot/body column is serialized accidentally.
- User-entered `body`/`category`, kind, identity, timestamps and color remain.
  `anchor` and content-derived labels are suppressed if access to that lesson's
  saved revision is denied. Highlight/bookmark rows remain present with no quote.
  A current FREE_PREVIEW revision never releases a different saved revision's quote.
- Enabled workspace search checks user-entered body/category only, never hidden
  quotations or snapshot titles; counts use the same conditions, closing a search
  oracle. Metadata fields are blank when not authorized, with existing API shapes.
- Personal progress reads only the owner's actual saved state (including old or
  unpublished revisions), with no inaccessible course totals or fabricated
  NOT_STARTED lessons. Most recent personal state per lesson is selected; no
  existing progress/history is migrated or reinterpreted as course access.
- New anchors/reading-position writes require access to the exact revision;
  editing an original annotation returns a freshly projected response. No new
  deletion or cleanup path was added.
- Published lesson detail requires `lesson.read`; chapter/navigation results
  require per-lesson metadata permission. Media display and thumbnail reads require
  `media.read` through at least one current published reference before storage
  bytes are fetched. Enabled mode does not accept the old Admin bypass. The HTTP
  route still authorizes before ETag/304 and retains private cache variation.
- The export UI already collected through fresh `lessonRequest` no-store calls,
  not lesson bodies or a saved React-query snapshot. It now re-collects after
  formatting and refuses download if the server projection changed in between.
  A failed refresh never falls back to the previously formatted blob.

User-entered body text has no authorship/provenance classifier: the code can
distinguish it from server-captured `anchor.quote`, but cannot establish whether a
user manually pasted text into their own note. It does not silently rewrite those
notes. Nor can a web server retract files or text already lawfully delivered to an
untrusted browser. The final fresh read is an authorization observation point,
not DRM or an atomic guarantee spanning a subsequent client download. Frontend
cache/revocation behavior beyond this export path still needs acceptance before
the activation barrier can be removed.

## Enforcement coverage — activation deliberately blocked

**Lesson/media/personal-study checks are now prepared in source, but question,
practice, exam and remaining discovery/admin boundaries are incomplete. This is
not an operable paid-content feature and must not be enabled.** Boundaries:

| Boundary | Current source evidence / remaining work |
| --- | --- |
| Published lesson bodies and neighboring metadata | `lessons.ts:publishedLesson`, `chapterLessonList`; prepared body and per-item metadata guards, no role shortcut; broader discovery/count review remains |
| Study/workspace/export disclosure | `private-study-access.ts`, `study.ts`; approved personal data projection, revision-aware quote denial and safe search; fresh export revalidation prepared |
| Media display, thumbnails and conditional responses | `lesson-media.ts:readLessonMedia`, `routes/lesson-media.ts`; current published reference plus explicit access before bytes/304, no enabled Admin bypass |
| Admin draft/library previews | `routes/lessons.ts`, `lesson-media-library.ts:listLibraryMedia`; separately define authoring capability versus learner entitlement, without making role equal purchase |
| Questions, practice pools/history and exam snapshots/review | `routes/questions.ts`, `practice.ts`, `exams.ts`; explicit version scoping and approved expiry/revocation/issued-session lease semantics first |
| Legacy discovery and metadata | `learning.ts`, `curriculum.ts`, `nexus.ts`, Phase 9C catalog; decide authorized metadata/list/count behavior and avoid mixed-course pools |

`middlewares/content-access-readiness.ts` is an **activation barrier**, mounted
immediately after health and before all other API routers. With no
`CONTENT_ACCESS_ENABLED=true`, it calls next without DB reads and legacy behavior
is unchanged. If the flag is requested, it returns sanitized no-store **503 for
all remaining API routes**, not a partially protected learning interface. Health
remains mounted first. This is intentionally not an operable enabled feature;
do not forward the flag through launchers or deploy it as enabled.

The barrier prevents accidentally activating policy storage/evaluation while
alternate routes, direct media UUIDs, thumbnail variants, admin reads or history
could still disclose protected data. It must not be removed or bypassed until
all enforcement boundaries and their offline/live isolated evidence are reviewed.
No storage URLs, auth implementation, educational text, scoring, question selection,
deadlines or RLS were modified. Existing behavior is retained while disabled;
source guards affect enabled branches, and export now performs a final fresh check.

## No manual grant/revoke API

The existing GLOBAL capability map has `roles.manage`, not an approved independent
entitlement-management permission. Neither legacy Admin nor an Owner assignment
is silently interpreted as that permission. The existing `admin_audit_events`
schema/functions describe role changes, not entitlement changes. No new API,
manager EXECUTE, broad grants or entitlement-management UI was invented.

Before implementing a mutator: approve the exact capability/delegation rules and
management trust boundary, then a narrow controlled function with atomic append-only
audit, idempotent request digest, expected-state checks and revocation semantics.
Current tables carry grant/revoke provenance but **are not a substitute for that
audit workflow**. Table-owner manual writes are not an authorized workaround.

## Additional activation prerequisites

- Source-only proposed ordering is 0018 RBAC, 0019 catalog, 0020 catalog binding,
  then 0021. Official journal, historical SQL, snapshots and protected manifests
  remain unchanged. Exact ordering/promotion/executor/startup branches need review.
- New incoming FKs from policies to `lessons` and `lesson_revisions` trigger the
  existing 0016 unreviewed-dependency safeguard. **Do not install this proposal
  before a separately reviewed forward dependency-handling design/rehearsal.**
  Do not edit historical deletion SQL or bypass its checks. Paid/access-linked
  resources must remain protected; deleting grants/evidence is not a solution.
- Current read-only baseline/identity/security/16-question dependency inventory
  remains unverified. Post-0017 verified backup and matching isolated restore,
  exact SQL compilation/security/data preservation/rejection tests and explicit
  owner migration/grant/maintenance approval are still required.
- No free/default policies or grants were backfilled. Activation needs an exact
  approved CCNA compatibility policy inventory; no existing user should be locked
  out through an accidental missing-policy rollout.
- All 16 owner-designated real questions and related rows, experimental lessons
  and exam history, and all other data must be preserved. No cleanup is implied.

## Offline verification

Earlier foundation: **26 PASS / 0 FAIL in three files** (15 access/barrier,
8 Phase 9C service/schema and 3 catalog-route tests).

Expiry-decision follow-up: **80 distinct API tests PASS** across seven focused
files (12 existing study, 32 existing lesson, 15 evaluator/barrier, 4 media,
5 media-read, 6 personal-privacy and 6 protected-read-boundary tests).
**18 frontend tests PASS** in Study Hub/export suites, including rejection of
a formatted file after fresh server quote redaction. Focused reruns are not
double-counted. Root `pnpm run typecheck`: **PASS**. One intermediate typecheck
identified inferred union types in new test result access; the tests now validate
through the real response schemas rather than casting the result. No assertions
weakened or skipped. These proofs
use mocked readers and source inspection, not database SQL execution, real Clerk
verification, live media authorization or browser acceptance. No full suite/build.

**Foundation prepared; end-to-end enforcement and audited management incomplete.
SOURCE PARTIAL. Activation and Public Beta: NO-GO.** No Phase 9E work.
