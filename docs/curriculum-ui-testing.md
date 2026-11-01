# Phase 8A verification

Run from `<repository-root>`:

```powershell
node tools/run-curriculum-tests.mjs
node tools/check-admin.mjs
node tools/build-admin-ui.mjs
```

These existing-cache workflows do not install packages, load `.env` files, connect to PostgreSQL, or start application services. The test runner disables database integration tests, uses mocked data/services, and runs loopback HTTP servers only for route tests. Production build output goes to a new timestamped `.local/admin-ui-production-build` folder without overwriting an earlier build.

Automated coverage includes exact six-domain/33-chapter ordering, explicit pilot bindings, unmapped and ambiguous handling, UUID preservation, summary field safety, route authentication/ADMIN boundaries, sanitized failure output, same-page expansion/switching/collapse, practice links, zero-question states and authorized question-manager links. Existing authentication, practice, learning progress and Admin regressions run alongside curriculum tests.

Implementation results: **162 tests passed across 11 files**, no failed or skipped tests in this selected suite. API/frontend/schema/API-client TypeScript passed using the installed-cache checker. Production compilation passed; existing tooltip/sheet/dropdown source-map lookup warnings were emitted. `git diff --check` passed. No database integration test was run.

## Manual layout and live-data acceptance

Use the existing guarded API/web startup commands only when services are stopped and the ports are free; no migration/grant is needed for this feature:

```powershell
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

Restart the API manually through the existing approved local workflow if it still runs the old router; do not terminate an unidentified process. Open `http://localhost:8080/topics`, sign in normally, and review:

1. At 1920×1080 / 100% zoom, exactly six collapsed cards appear in a 3×2 grid inside the existing sidebar shell, with no vertical page scroll required for the cards. The compact header/two card rows are designed for this viewport; actual browser geometry requires manual verification.
2. Expand each domain: overview stays visible; chapter order matches Phase 8A; switching/collapse does not navigate or refetch the summary. Tab/Enter/Space activate buttons; Escape collapses and returns focus.
3. Select a populated chapter. Compare count summaries with the Admin question list filtered by the same topic UUID and ACTIVE status. Shared topics have overlapping chapter counts but are counted once per domain.
4. Start Practice opens the unchanged topic-based flow. No answer/correctness data appears in the curriculum response. Learners have no View Questions link; active ADMIN users have the filtered Admin link.
5. Empty chapters say “No questions available yet” and have disabled practice. Labs say “Labs coming soon”. Progress appears only from the actual learner progress API and is labeled coverage, not completion/mastery.
6. As ADMIN, expand the mapping review; compare UUIDs/slugs and counts. As USER, both review UI and its API are inaccessible.
7. Check 1024×768 tablet and 390×844 mobile, long names/descriptions, keyboard focus, reduced-motion preferences, loading, missing session and failed API responses. Small screens may scroll.

Browser integration was not attempted, as previously requested. No screenshots, measured viewport fit, live database mapping totals or database-backed count comparisons are claimed by the automated tests. Database integration tests are NOT RUN. Record those manual outcomes here after reviewing the running application.
