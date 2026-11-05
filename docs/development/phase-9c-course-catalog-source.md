# Phase 9C — minimal course catalog source

Prepared on `main`, baseline `debda491d157fb56a792daafa6a11206e0428303`.
**SOURCE ONLY. DATABASE ACTIVATION NOT AUTHORIZED.** No live catalog, records,
permissions or SQL compilation have been verified. [Owner preservation rules](../architecture/phase-9a-owner-approval-record.md)
and [architectural design](../architecture/phase-9a-multitrack-design.md) remain binding.

## Prepared foundation

- `lib/db/src/schema/course-catalog.ts`: Track → Course → CourseVersion, stable
  IDs/slugs, DRAFT/ACTIVE/RETIRED metadata, one dedicated existing blueprint per
  version. No catalog creation/publication endpoints or course-content authoring.
- `curriculum-chapters.ts`: nullable `course_version_id`, indexed and bound with
  `blueprint_id` through a composite FK. Existing chapter/topic identity and all
  three CCNA CHECKs remain intact. No hardcoded course UUID in a generalized CHECK.
- `catalog-identity.ts`: deterministic IDs for **new catalog metadata only**.
  UUIDv5 DNS namespace, names `ccna-nexus/catalog/track/networking`,
  `ccna-nexus/catalog/course/ccna-200-301`, and
  `ccna-nexus/catalog/version/ccna-200-301/v1.1-book-48`.
- `src/lib/course-catalog.ts` and `routes/course-catalog.ts`: authenticated,
  no-store, read-only metadata. `COURSE_CATALOG_ENABLED` must equal `true`;
  default is 503 `CATALOG_NOT_READY` before any catalog query. Never enable before
  separately verified activation. Unknown/mismatched/hidden context returns 404;
  malformed IDs/pagination return 400; driver details never reach the response.

API mounted under the existing `/api` router:

| GET | Context / bounds |
| --- | --- |
| `/api/catalog/tracks` | ACTIVE tracks; page 1–10000, fixed 20/page |
| `/api/catalog/tracks/:trackId/courses` | UUID track, ACTIVE parent and courses; same pagination |
| `/api/catalog/courses/:courseId/versions` | UUID course, ACTIVE track/course/version/blueprint; same pagination |
| `/api/catalog/courses/:courseId/versions/:versionId` | Exact belonging course/version pair, all ACTIVE ancestors and blueprint; domains and ACTIVE-topic chapters bound to that version **and** blueprint in one statement |

Read responses expose catalog metadata/original titles and IDs, not lesson bodies,
answers, user data or access entitlements. These routes do not authorize learning,
exam selection or media access. No OpenAPI-generated contract was changed; these
are separate additive metadata routes, not replacements for current APIs. Existing
Clerk verification and legacy authorization remain unchanged.

## Proposed SQL ordering and preservation

Neither file is registered in the official journal or applied. Sequence numbers
are reservations only; future activation preparation must validate exact ordering
against the installed baseline and the independently proposed 0018 RBAC package.
The catalog itself does not depend on RBAC tables/functions.

1. `lib/db/drizzle/proposed/0019_course_catalog.sql`: additive tables/binding,
   RESTRICT relationships, immutable metadata identity/binding triggers. App gets
   SELECT on the three new metadata tables only, no catalog writes. Existing
   table-level chapter INSERT/UPDATE grants cannot be narrowed by a column REVOKE;
   the invoker trigger permits first binding only to the reviewed migrator and
   prohibits reparenting an already bound chapter. Legacy NULL inserts remain valid.
   Function search paths are fixed; PUBLIC execution is revoked. Existing lesson
   RLS, controlled deletion, revisions and RBAC grants/functions are not changed.
2. `lib/db/drizzle/proposed/0020_ccna_catalog_backfill.sql`: separately approved
   metadata backfill, one atomic DO block with maintenance locks. Resolves the
   existing unique `200-301` / `1.1` blueprint. Requires exactly the original 48
   chapters and exact ID/code/volume/number/domain/slug tuples from the checked-in
   canonical source, matching topic/domain/blueprint references, no prior bindings,
   and empty new catalog tables. Stops on missing, additional, drifted or partial
   state; no silent conflict adoption or automatic retry.

Working-copy SHA-256 (reverify exact artifact bytes during activation preparation):

- 0019: `523867f56ea86756768957e618e0ba198a1c1c5932949d1bd07206e639c159a9`
- 0020: `d4223937d568ac7270e66ea5c65f12607a3ef32df93fe0f09d71f8ea4268dd59`

No protected manifest was regenerated. Git line-ending normalization must be
accounted for before future artifact pinning; these are not activation receipts.

Backfill creates one **DRAFT** track/course/version and changes only the new chapter
binding, checking exactly 48 affected rows. It does not publish final learning
content, change existing topic/blueprint status, replace IDs, translate stored text,
or modify questions/options/revisions, lessons/media/study, exams/practice or users.
All **16 owner-designated real questions and dependencies must be preserved**;
their current live count/identity is not independently verified. Experimental
lessons/results and all otherwise unclassified data remain preserved, not disposable.

Legacy curriculum, practice, exam, lesson and import reader queries are unchanged.
One compatibility adjustment replaces Drizzle's implicit chapter INSERT with a
parameterized explicit list of the existing seven columns: adding a schema field
must not make pre-activation creation reference an absent column. A regression
checks this path and its original IDs/values. Existing edit predicates are unchanged.

## Deliberate limits and unresolved decisions

- New metadata stays DRAFT/invisible until separately approved catalog publication.
  DRAFT catalog status does not hide existing CCNA lessons/questions on legacy routes.
- Existing CCNA canonical/number/code CHECKs are **not generalized**. Consequently
  this is an identity/read foundation, not a working arbitrary-course content
  publishing system. Before another course's learning content is made available,
  approve protected canonical registry/relational tuple enforcement and review
  every legacy learner/import selection path for explicit CCNA defaults. Current
  legacy pool queries must not be assumed safe for future cross-course content.
- Non-certification publishing cannot reuse ACTIVE blueprint semantics by inventing
  certification source URLs/weights/verification. That separate lifecycle decision
  remains unresolved; no workaround or generic publishing action was implemented.
- Real `courses.id` references are now defined as the future FK target for COURSE
  assignments, but 0018 GLOBAL CHECK, policy/delegation and strict inputs remain
  unchanged. No COURSE assignment/UUID is accepted, no role activation or promotion.
- No UI, entitlements, billing, user/content mutation APIs, export rebranding,
  historical exam attribution or Phase 9D implementation was introduced.

## Activation gates and recovery

Pending: resolve the earlier exit-0/missing-JSON check evidence (not rerun here);
authorize current read-only identity/0017 ledger/schema/security/question inventory;
obtain verified **post-0017 backup plus matching isolated restore**; separately
approve 0018 ordering/manager/bootstrap or amend migration ordering before source
promotion. Existing pre-0017 recovery evidence is insufficient.

Prepare exact proposed snapshots/journal/manifests, dedicated executor and old/new
startup guards together under later approval. Do not alter historical migrations,
reuse old activation executors, bypass pins, or run unrestricted migrate. Launcher
allowlists have not been changed to forward the feature flag. Review exact ACLs,
default privileges, owners and trigger definitions; no broad application grants.

Rehearse SQL compilation, FK/immutability/permission rejection, full data/security
and sequence fingerprints, 48 exact bindings, repeat rejection and rollback in an
isolated restore. Verify catalog DRAFT invisibility, intended publication separately,
and all legacy routes. No live proof is supplied by mocked or SQL-structure tests.
Before commit, rollback the transaction on mismatch. After uncertain/committed
activation, stop for read-only diagnosis; no automated down migration, drops,
rebinding, restore-over-newer-data or deletion is authorized.

## Verification

**36 tests PASS / 0 FAIL, three files:** new service/schema/proposal tests (8),
new route/auth/error tests (3), existing canonical suite including the new explicit
legacy INSERT regression (25). Root `pnpm run typecheck`: **PASS**. The first test
launcher was blocked by Windows sandbox access; the same focused command ran
outside that filesystem sandbox. One new source scanner initially matched a
prohibited SQL phrase inside an explanatory comment; that comment was reworded,
with the assertion unchanged, then all 36 passed. `git diff --check`: **PASS**.
No DB test, build, full suite, real authentication, storage operation, service
change or Git mutation. SQL execution/compilation and actual data preservation
remain **NOT VERIFIED LIVE**. Minimal catalog foundation source: **COMPLETE**;
generic course-content publication and COURSE authorization remain pending.
