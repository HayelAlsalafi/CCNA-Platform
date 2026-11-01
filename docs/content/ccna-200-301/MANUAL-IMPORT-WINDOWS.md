# Sprint 7 manual import and publication on Windows

Your approval to import and publish **new pilot content** remains valid. This runbook uses the existing Admin UI and protected Admin APIs; it adds no schema, auth bypass, migration, grant or seed. I have not executed the live writes.

The fastest path is **API setup -> real-ID export -> offline CSV validation -> UI import -> API publication**. It avoids typing 84 creation forms and editing 60 questions individually. The optional helper is a local operator script under this content folder; importing it runs nothing. You explicitly invoke each phase from your existing signed-in Admin tab. A UI-only alternative is below.

## 1. Check the files and services

In PowerShell:

```powershell
Set-Location -LiteralPath '<repository-root>'
node docs/content/ccna-200-301/prepare-pack.mjs --check
if ($LASTEXITCODE -ne 0) { throw 'Pilot pack check failed.' }
node docs/content/ccna-200-301/validate-pack.mjs
if ($LASTEXITCODE -ne 0) { throw 'Offline tests failed.' }
Invoke-RestMethod -Uri 'http://localhost:8080/api/healthz' -TimeoutSec 5
```

Expect PASS with 24 topics, 60 questions, 53 objectives, verified manifest; tests pass; health is ok. Do not run --prepare again or edit the reviewed content to suppress a failure.

If services are not running, use the existing guarded startup in separate PowerShell terminals, only when the relevant port is free:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
```

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

Skip startup commands if the services already run. Do not kill another process or run migrations/grants for this procedure.

## 2. Open Admin and inspect the setup plan

1. Open **http://localhost:8080/admin** in your normal browser.
2. Use the existing **Sign in** action if needed. Verify the account menu displays ADMIN and the Admin overview loads. Do not change account roles.
3. Press **F12**, select the **Console** tab and run the following commands there, not in PowerShell:

```javascript
var sprint7 =
  await import("/@fs/<repository-root>/docs/content/ccna-200-301/manual-admin-workflow.browser.mjs");
var s7 = await sprint7.connect();
await s7.inspect();
```

The helper uses the real Clerk session and checks /api/auth/me and /api/admin/access for an active server-authorized ADMIN. It refreshes the normal session token in memory as needed, sends X-Admin-Session and never prints or saves tokens. This is [Clerk's supported session-token mechanism](https://clerk.com/docs/guides/development/making-requests). No password/token copying is needed.

Inspect returns a runId, creation counts and any differing existing objective descriptions. In an empty catalog, expect **1 blueprint + 6 domains + 53 objectives + 24 topics**. Natural keys are checked before creation: exam/version, domain code, objective code, and topic slug. No arbitrary-name matching.

Review existing objective-description differences against the verified code/domain and curriculum. Reuse preserves the existing description unchanged. If it describes a different concept, stop. Structural conflicts, duplicate keys, retired/unverified blueprint metadata, conflicting topic fields and preexisting DISABLED topics without this run's receipt are refused. Do not change old records to make the script pass.

## 3. Create missing taxonomy and topics through Admin APIs

After reviewing the inspect result, in the same Console:

```javascript
await s7.createSetup({ reviewedReuse: true });
```

This is the approved setup write step. The helper rechecks the inspected catalog before POSTing each missing record and records IDs as responses arrive. Blueprint starts DRAFT; new topics start DISABLED. Existing matching records are reused unchanged. Existing topics must already be ACTIVE unless the receipt proves that this run created them; the helper never activates an unrelated old topic.

Expected clean result:

```json
{
  "runId": "...",
  "created": { "blueprints": 1, "domains": 6, "objectives": 53, "topics": 24 },
  "bindingsReady": true
}
```

Counts can be lower when verified records are reused. Any failure stops immediately; there is no automatic retry, cleanup or rollback of earlier individual setup requests. Keep the tab open. Run s7.download('receipt') to preserve the partial receipt. If pendingWrite is present, its completion is uncertain: inspect that exact operation in Admin before any further writes.

To visually check setup, use the application's **Taxonomy** navigation link to /admin/taxonomy, then **Blueprints & objectives**, and select the v1.1 blueprint. Check six domains and weights 20/20/25/10/15/10. Use **Topics** to /admin/topics and search **ccna-v1-1-s7**; the new topics are Disabled.

## 4. Download real bindings, objective IDs and the setup receipt

In the same Console, run each command separately:

```javascript
s7.download("bindings");
s7.download("catalog");
s7.download("receipt");
```

Save these files to your Windows **Downloads** folder. Each command prints its exact filename:

- sprint7-bindings-RUNID.json: real blueprint, six domain and 24 topic UUIDs, keyed by exact slug/code.
- sprint7-catalog-RUNID.json: matched Admin records, including all 53 objective UUIDs and parent bindings.
- sprint7-receipt-RUNID.json: IDs actually created by this run; contains no auth credentials.

The question CSV uses objective codes, not objective UUID columns. The existing importer resolves those codes to objective UUIDs in the specified real blueprint. The exported catalog lets the offline check verify the relationships before upload.

Do not copy IDs manually when using this path. Do not substitute test UUIDs. If a browser saves with an added filename suffix, use the actual printed/saved filename when copying below.

## 5. Copy exports and generate the final CSV

In PowerShell, paste the numeric runId printed by the helper:

```powershell
Set-Location -LiteralPath '<repository-root>'
$runId = Read-Host 'Paste the numeric runId printed by s7'
if ($runId -notmatch '^[0-9]{10,16}$') { throw 'Invalid runId.' }
$packRoot = Join-Path (Get-Location) 'docs/content/ccna-200-301'
$downloads = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'
$runFolder = Join-Path $packRoot ('manual-runs\' + $runId)
$files = @(
  @{ Source = "sprint7-bindings-$runId.json"; Target = 'bindings.json' },
  @{ Source = "sprint7-catalog-$runId.json"; Target = 'catalog.json' },
  @{ Source = "sprint7-receipt-$runId.json"; Target = 'setup-receipt.json' }
)
foreach ($file in $files) {
  if (!(Test-Path -LiteralPath (Join-Path $downloads $file.Source) -PathType Leaf)) {
    throw ('Missing downloaded file: ' + $file.Source)
  }
}
if (Test-Path -LiteralPath $runFolder) {
  throw 'Run folder already exists; preserve it and use its verified files rather than overwrite.'
}
New-Item -ItemType Directory -Path $runFolder -ErrorAction Stop | Out-Null
foreach ($file in $files) {
  Copy-Item -LiteralPath (Join-Path $downloads $file.Source) -Destination (Join-Path $runFolder $file.Target) -ErrorAction Stop
}
$bindingsPath = Join-Path $runFolder 'bindings.json'
$catalogPath = Join-Path $runFolder 'catalog.json'
$bound = node docs/content/ccna-200-301/prepare-pack.mjs --bind "$bindingsPath" | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $bound.status -ne 'PASS') { throw 'Binding failed.' }
$csvPath = Join-Path $bound.output 'questions.import.csv'
node docs/content/ccna-200-301/validate-pack.mjs --csv "$csvPath" --catalog "$catalogPath" --bindings "$bindingsPath"
if ($LASTEXITCODE -ne 0) { throw 'Final CSV validation failed; do not upload.' }
Write-Output ('UPLOAD THIS FILE: ' + $csvPath)
```

This copies into a new folder, preserves earlier files and creates a new bound CSV directory. It performs no API or database operation. It validates the CSV with the real parser/input schemas, checks all UUID relationships against the exported catalog, checks exact reviewed question content, and expects **60 accepted, zero rejected/duplicates** against that snapshot. Snapshot validation is not a live duplicate check; the UI preview below is authoritative.

If files were saved elsewhere, change only the downloads directory or exact Source filenames. Keep the output under docs/content/ccna-200-301. If resuming in a new PowerShell window, restore bindingsPath/catalogPath/csvPath to the exact existing files; do not overwrite/recreate the run folder.

## 6. Preview and explicitly import the questions

Stay in the same signed-in browser tab; use the application's **Bulk import** link to **http://localhost:8080/admin/import**. SPA navigation preserves the helper. If the page was reloaded, reconnect with the three commands in step 2; the same-tab session receipt restores the created-ID boundary.

Before confirming an import, in Console:

```javascript
await s7.markImport();
```

Then perform these exact UI actions:

1. In **2. Upload and validate**, use **Select CSV / XLSX file**. In the Windows file picker, paste the full questions.import.csv path printed by PowerShell.
2. Click **Validate and preview**.
3. In **3. Review before import**, expect **60 accepted, 0 rejected, 0 duplicates** for a first clean import. Expand question rows and check options, explanations and objective mappings. Stop on unexpected counts/errors.
4. Check **I confirm importing 60 accepted rows as unpublished drafts.**
5. Click **Import accepted rows as drafts**.
6. In the confirmation dialog, click **Confirm draft import**.
7. Expect **Import complete** with **60 questions imported as unpublished drafts (DISABLED)**.
8. Expand **Imported question IDs**. Do not click **Import another file**, reload, or leave the result page until the next step records those IDs.

For an unchanged repeat import, 60 duplicates is expected; do not change stems/slugs to evade that result. This clean-run publication helper deliberately requires the exact 60 newly returned IDs. A mixed/partial import needs review of the receipt and counts; it does not authorize publishing old duplicates.

## 7. Capture the actual new IDs and publish only this run

On the completed import page, in Console:

```javascript
await s7.captureImportedIds();
s7.download("receipt");
```

Expect verifiedImportedQuestions: 60. This reads the displayed import-result IDs and verifies those IDs through the supported Admin list and mapping APIs. It checks creation time, exact topic/text/options/correctness/explanation/reference marker, and each primary objective. It does not scan for similarly named questions and guess which to publish.

Now run the already-approved publication step:

```javascript
await s7.publish();
s7.download("receipt");
```

Expected result: **60 active pilot questions, 24 active pilot topics, existingContentRecordsModified: 0**. The helper:

- PATCHes only the verified new question IDs with status ACTIVE; existing revision capture stays in place.
- PATCHes only topics recorded as newly created by this run. Reused ACTIVE topics stay unchanged.
- Activates only a blueprint created by this run, after checking the six-domain catalog and unchanged metadata. Reused blueprints stay unchanged.
- Re-reads question content/mappings and all 24 topic statuses to verify learner visibility.

Retain the newly downloaded final receipt as a separate version; do not overwrite the earlier setup receipt. If a request fails, some prior publications may already have succeeded. Stop and keep the receipt; do not reset, disable, delete or retry an uncertain pendingWrite. Individual publication requests are not one all-or-nothing bulk transaction. Keep other administrators from editing this pack during publication; the existing API has no edit-version precondition.

## 8. Check the learner experience

1. Refresh the app after completion to refresh query caches.
2. Open **http://localhost:8080/topics**. The 24 new pilot topics should be available, each with two or three questions.
3. Open **http://localhost:8080/practice**, choose a pilot topic, answer a question and submit through the normal practice flow.
4. Existing ACTIVE content may still appear. Do not disable test/fixture records as part of this import; no such changes were approved.

## UI-only alternative

Use this if the operator helper cannot load or the browser Console is unavailable. Do not weaken browser security settings. Setup takes more manual entry, but uses the same supported application.

| Page                                     | Button/action                                                                                                                                                                                | Source                          |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| /admin/taxonomy, Blueprints & objectives | Search/select 200-301 v1.1; inspect existing records first. If absent, **Create blueprint**; fill fields; Status DRAFT; **Save taxonomy**.                                                   | blueprint.create.json           |
| Same selected blueprint                  | **Create domain**; choose Blueprint; fill Objective / domain code, Domain name, Weight (%) and Display order; **Save taxonomy**, six times.                                                  | domains.create.template.json    |
| Same selected blueprint                  | **Create objective**; choose the matching Domain; fill Objective / domain code, Objective description and Display order; **Save taxonomy**, 53 times.                                        | objectives.create.template.json |
| /admin/topics                            | Use **Search topics** for each exact slug first. In **Create a topic**, enter Name, Slug, Display order, Status DISABLED and Description; click **Create topic**, 24 times.                  | topics.create.json              |
| /admin/import                            | Expand **Topic IDs and blueprint/objective reference** to read real blueprint/topic IDs. Blueprint ID also appears in the taxonomy panel.                                                    | bindings.example.json           |
| /admin/taxonomy                          | Objective UUIDs are available in the authenticated GET /api/admin/taxonomy response; the existing UI does not display every objective UUID. CSV needs codes, so do not invent UUIDs.         | Actual Admin catalog            |
| /admin/import                            | Follow step 6 exactly using the bound CSV. Record **Imported question IDs**.                                                                                                                 | questions.import.csv            |
| /admin/questions                         | Filter by the pilot topic and Status DISABLED; match each row to the returned IDs, not just text. Click its **Edit**, change Status to ACTIVE, then **Save changes**, for each new question. | Actual import IDs               |
| /admin/topics                            | Match each newly created topic by its recorded UUID/slug; **Edit**, Status ACTIVE, **Save changes**. Never activate an unrelated reused DISABLED topic.                                      | Creation receipt                |
| /admin/taxonomy                          | For a newly created blueprint only: **Edit blueprint**, Status ACTIVE, check the source-review acknowledgement, **Save taxonomy**.                                                           | New blueprint ID                |

For a completely UI-only setup, use DevTools **Network**, reload /admin/taxonomy and /admin/topics, select the authenticated requests, and save their **Response** JSON. Do not copy Authorization headers or cookies. Copy `bindings.example.json` to a new `manual-runs` subfolder as `bindings.json`; replace every null with the actual blueprint, domain and topic UUID, matching domain codes and exact topic slugs. Save a `catalog.json` object containing `packId` from the bindings, the selected blueprint in `blueprints`, its six `domains`, its 53 `objectives`, and the 24 matching `topics` from those responses. Use the binding and validation commands in step 5 with those paths. Keep a separate list of IDs you created; publication must use only those IDs and the import result IDs. The helper's `inspect()` alone does not generate bindings for a manual setup. Objective UUIDs stay in the catalog snapshot; the question CSV uses objective codes. Templates containing **BIND** are never direct upload/API data.

## Preparation validation

The content and helper tests passed **23 database-free tests**: real CSV/input schemas, duplicate simulation, exact setup counts, safe reuse, conflict refusal, uncertain-write refusal, session/RBAC refusal, receipt restoration and publication restricted to returned new IDs. Syntax checks pass. No live API write, setup, import or publication was performed by me. The extra final-import test runs only after you supply your actual exported catalog/bindings/CSV.
