# Approved repository cleanup result

Completed 2026-10-26. Workspace: `<repository-root>`; branch `main`; HEAD `3c07b4bb7fe807e60dcbcd5539c046b919a9956f`. User explicitly approved only confirmed-safe entries in the prior 46-file proposal. The original audit, inventory and proposal remain unchanged as historical evidence.

Deleted **46 files / 6,466,306 logical bytes (6.17 MiB)**: 45 duplicate compiled/static files and one unused retired stylesheet. No directories were removed. Allocated filesystem blocks/free-space recovery were not measured; this figure is removed file lengths, not a physical free-space claim. Verification produced a new retained 1,004,894-byte compile-only build plus this receipt, so net workspace size reduction is smaller.

## Verification

| Check | Actual result |
| --- | --- |
| Candidate raw SHA-256, byte sizes, canonical workspace paths and non-symlink ancestors | PASS for all 46 before deletion |
| Duplicate counterparts outside deletion set | PASS for all 45 before and after deletion |
| Post-deletion absence | PASS for all 46 individual files |
| Source/configuration references | PASS: 740 files searched, no references to removed stylesheet/output paths outside historical audit records |
| Accessible local scripts | PASS: 191 scripts searched before deletion, no candidate references; 25 inaccessible protected directories left untouched |
| `node tools/check-admin.mjs` | PASS: API, frontend, schema and API-client TypeScript using installed dependencies |
| `node tools/build-admin-ui.mjs` | PASS: 1,952 modules; `.local/admin-ui-production-build/1793004410944` |
| Production output versus pre-cleanup audit build | PASS: all five filenames/content hashes identical; local HTML script/stylesheet/icon references resolve |
| Existing file preservation | PASS: other 983 snapshotted files byte-for-byte unchanged; environment/unknown binary files not opened for hashing |
| Git diff | Only new tracked change is deletion of `artifacts/ccna-learning/src/pages/exam-simulator.css`; original modified/untracked work preserved. Forty-five ignored output removals do not appear in Git diff. This receipt is new documentation. |
| `git diff --check` | PASS with existing LF/CRLF policy warnings |
| Application tests and offline safety tests | NOT RUN, as requested; the three known baseline failures were not investigated or changed |
| Database, migrations, live runtime checks | NOT RUN; zero database connections/writes, no services started/stopped |

Existing nonfatal sourcemap-location warnings remain for tooltip, sheet, dropdown-menu and command UI components; the existing >500 kB bundle warning remains. No new compile, missing-reference or entry-point issue was observed. This is static/compile verification, not a live-runtime claim.

The 14 checked entry points include the learning HTML/main/App, current exam page and `exam-workspace.css`, API index/app/router/exam route, schema/client exports, root Lovable server/router, and guarded local launcher. No application logic, configuration, lockfile, test, migration or privilege script changed.

## Exact deleted files

- `.local/admin-ui-production-build/1791899692234/assets/index-BEC90qP3.css` ? 155,728 bytes; SHA-256 `e50cb2e2b9e8957bdb18d7835300028c268384dba6b281ad6a8ff2254d675557`.
- `.local/admin-ui-production-build/1791899692234/assets/index-nyyrWAz0.js` ? 423,884 bytes; SHA-256 `a888b78c8c12b500bd555fae31bf8a227b1b2259ac088e126f62747caac1fb7d`.
- `.local/admin-ui-production-build/1791899692234/favicon.svg` ? 166 bytes; SHA-256 `2c19c130727abc05e0851196f8d18a968ea207e982ec06e96b747d412b7e8bd4`.
- `.local/admin-ui-production-build/1791899692234/index.html` ? 1,444 bytes; SHA-256 `18732e9f785874a46b776560c47631ae8f9596c52f2da6dff05f2b0ca0a00f87`.
- `.local/admin-ui-production-build/1791899692234/robots.txt` ? 25 bytes; SHA-256 `1cbdbc6504be7abe1267d01d7f565bfcfe5851ba3f6a3754d1d61c8f8a2c6aa3`.
- `.local/admin-ui-production-build/1791904684565/assets/index-BEC90qP3.css` ? 155,728 bytes; SHA-256 `e50cb2e2b9e8957bdb18d7835300028c268384dba6b281ad6a8ff2254d675557`.
- `.local/admin-ui-production-build/1791904684565/assets/index-nyyrWAz0.js` ? 423,884 bytes; SHA-256 `a888b78c8c12b500bd555fae31bf8a227b1b2259ac088e126f62747caac1fb7d`.
- `.local/admin-ui-production-build/1791904684565/favicon.svg` ? 166 bytes; SHA-256 `2c19c130727abc05e0851196f8d18a968ea207e982ec06e96b747d412b7e8bd4`.
- `.local/admin-ui-production-build/1791904684565/index.html` ? 1,444 bytes; SHA-256 `18732e9f785874a46b776560c47631ae8f9596c52f2da6dff05f2b0ca0a00f87`.
- `.local/admin-ui-production-build/1791904684565/robots.txt` ? 25 bytes; SHA-256 `1cbdbc6504be7abe1267d01d7f565bfcfe5851ba3f6a3754d1d61c8f8a2c6aa3`.
- `.local/admin-ui-production-build/1791910872322/assets/index-B0jiQ0mK.js` ? 423,884 bytes; SHA-256 `a888b78c8c12b500bd555fae31bf8a227b1b2259ac088e126f62747caac1fb7d`.
- `.local/admin-ui-production-build/1791910872322/assets/index-DhwLOtmB.css` ? 157,571 bytes; SHA-256 `f889e6dd2a2d19416cc9cf104871974ce8e0ee9d29259261d38ff9bf1a8d7540`.
- `.local/admin-ui-production-build/1791910872322/favicon.svg` ? 166 bytes; SHA-256 `2c19c130727abc05e0851196f8d18a968ea207e982ec06e96b747d412b7e8bd4`.
- `.local/admin-ui-production-build/1791910872322/index.html` ? 1,444 bytes; SHA-256 `6658c3c4a8654257e057c75c7fef5f22d4bd5d1508ba89d219c5dd465ca649ac`.
- `.local/admin-ui-production-build/1791910872322/robots.txt` ? 25 bytes; SHA-256 `1cbdbc6504be7abe1267d01d7f565bfcfe5851ba3f6a3754d1d61c8f8a2c6aa3`.
- `.local/admin-ui-production-build/1791911689242/assets/index-B0jiQ0mK.js` ? 423,884 bytes; SHA-256 `a888b78c8c12b500bd555fae31bf8a227b1b2259ac088e126f62747caac1fb7d`.
- `.local/admin-ui-production-build/1791911689242/assets/index-DhwLOtmB.css` ? 157,571 bytes; SHA-256 `f889e6dd2a2d19416cc9cf104871974ce8e0ee9d29259261d38ff9bf1a8d7540`.
- `.local/admin-ui-production-build/1791911689242/favicon.svg` ? 166 bytes; SHA-256 `2c19c130727abc05e0851196f8d18a968ea207e982ec06e96b747d412b7e8bd4`.
- `.local/admin-ui-production-build/1791911689242/index.html` ? 1,444 bytes; SHA-256 `6658c3c4a8654257e057c75c7fef5f22d4bd5d1508ba89d219c5dd465ca649ac`.
- `.local/admin-ui-production-build/1791911689242/robots.txt` ? 25 bytes; SHA-256 `1cbdbc6504be7abe1267d01d7f565bfcfe5851ba3f6a3754d1d61c8f8a2c6aa3`.
- `.local/admin-ui-production-build/1791960529194/assets/index-B0jiQ0mK.js` ? 423,884 bytes; SHA-256 `a888b78c8c12b500bd555fae31bf8a227b1b2259ac088e126f62747caac1fb7d`.
- `.local/admin-ui-production-build/1791960529194/assets/index-DhwLOtmB.css` ? 157,571 bytes; SHA-256 `f889e6dd2a2d19416cc9cf104871974ce8e0ee9d29259261d38ff9bf1a8d7540`.
- `.local/admin-ui-production-build/1791960529194/favicon.svg` ? 166 bytes; SHA-256 `2c19c130727abc05e0851196f8d18a968ea207e982ec06e96b747d412b7e8bd4`.
- `.local/admin-ui-production-build/1791960529194/index.html` ? 1,444 bytes; SHA-256 `6658c3c4a8654257e057c75c7fef5f22d4bd5d1508ba89d219c5dd465ca649ac`.
- `.local/admin-ui-production-build/1791960529194/robots.txt` ? 25 bytes; SHA-256 `1cbdbc6504be7abe1267d01d7f565bfcfe5851ba3f6a3754d1d61c8f8a2c6aa3`.
- `.local/admin-ui-production-build/1791963740291/assets/index-B0jiQ0mK.js` ? 423,884 bytes; SHA-256 `a888b78c8c12b500bd555fae31bf8a227b1b2259ac088e126f62747caac1fb7d`.
- `.local/admin-ui-production-build/1791963740291/assets/index-DhwLOtmB.css` ? 157,571 bytes; SHA-256 `f889e6dd2a2d19416cc9cf104871974ce8e0ee9d29259261d38ff9bf1a8d7540`.
- `.local/admin-ui-production-build/1791963740291/favicon.svg` ? 166 bytes; SHA-256 `2c19c130727abc05e0851196f8d18a968ea207e982ec06e96b747d412b7e8bd4`.
- `.local/admin-ui-production-build/1791963740291/index.html` ? 1,444 bytes; SHA-256 `6658c3c4a8654257e057c75c7fef5f22d4bd5d1508ba89d219c5dd465ca649ac`.
- `.local/admin-ui-production-build/1791963740291/robots.txt` ? 25 bytes; SHA-256 `1cbdbc6504be7abe1267d01d7f565bfcfe5851ba3f6a3754d1d61c8f8a2c6aa3`.
- `.local/admin-ui-production-build/1792042367664/assets/index-6kzj_3oz.css` ? 183,200 bytes; SHA-256 `fd6fd0b26b1b63f346913890c83b0ce662a5d205dc591f52ecf35cb9da4c3dd9`.
- `.local/admin-ui-production-build/1792042367664/assets/index-BsbvrQBC.js` ? 720,541 bytes; SHA-256 `3eae30004d8e880f0fe9a7a9631283ad422aedac5fe35e2e9cb77163353ba95f`.
- `.local/admin-ui-production-build/1792042367664/favicon.svg` ? 166 bytes; SHA-256 `2c19c130727abc05e0851196f8d18a968ea207e982ec06e96b747d412b7e8bd4`.
- `.local/admin-ui-production-build/1792042367664/index.html` ? 1,444 bytes; SHA-256 `f256464c79b9ee4b35c0158bec17ec5276febe1a9e9006dbf3d03b10f0a190ff`.
- `.local/admin-ui-production-build/1792042367664/robots.txt` ? 25 bytes; SHA-256 `1cbdbc6504be7abe1267d01d7f565bfcfe5851ba3f6a3754d1d61c8f8a2c6aa3`.
- `.local/admin-ui-production-build/1792231435945/assets/index-Bc4MXIzA.css` ? 255,421 bytes; SHA-256 `a363dbc184d3b5d72bdfb0c575b604169a05f97ea2c795a01867a3f663ac2fb6`.
- `.local/admin-ui-production-build/1792231435945/assets/index-DawBanU-.js` ? 773,676 bytes; SHA-256 `9385506372200603264c4b407721b0a63157dfaa72e8e84811dce1fe028ee3aa`.
- `.local/admin-ui-production-build/1792231435945/favicon.svg` ? 166 bytes; SHA-256 `2c19c130727abc05e0851196f8d18a968ea207e982ec06e96b747d412b7e8bd4`.
- `.local/admin-ui-production-build/1792231435945/index.html` ? 1,444 bytes; SHA-256 `f2e80f91847abf1a382cd3a6f3179b0dacba8e9a6dd11f2890cbbfbbbff5ac6d`.
- `.local/admin-ui-production-build/1792231435945/robots.txt` ? 25 bytes; SHA-256 `1cbdbc6504be7abe1267d01d7f565bfcfe5851ba3f6a3754d1d61c8f8a2c6aa3`.
- `.local/admin-ui-production-build/1792262532062/assets/index-Clya5GM8.js` ? 762,816 bytes; SHA-256 `19ca022c4ccea56f6681a790e81fc67490434f9b5f320a9958202efe2b478f0b`.
- `.local/admin-ui-production-build/1792262532062/assets/index-Dl2CpqOr.css` ? 255,974 bytes; SHA-256 `0a3414651804bc077bcc645758f15f0f5ba1c7db2cb1f949c2a08db34676441a`.
- `.local/admin-ui-production-build/1792262532062/favicon.svg` ? 166 bytes; SHA-256 `2c19c130727abc05e0851196f8d18a968ea207e982ec06e96b747d412b7e8bd4`.
- `.local/admin-ui-production-build/1792262532062/index.html` ? 1,444 bytes; SHA-256 `19880665ae1488b5a74a3b347c65e3997cf62ed7e4887a3a6a2995767b796a8f`.
- `.local/admin-ui-production-build/1792262532062/robots.txt` ? 25 bytes; SHA-256 `1cbdbc6504be7abe1267d01d7f565bfcfe5851ba3f6a3754d1d61c8f8a2c6aa3`.
- `artifacts/ccna-learning/src/pages/exam-simulator.css` ? 14,919 bytes; SHA-256 `de73f67a1c80b578af6d8c1f27db9252161bda8e874b68bcea1a26a31352ecd2`.

## Retained files and reasons

All 46 proposed entries were confirmed safe and removed; **none were skipped**. Every file outside that exact list was retained, including all application logic, current exam components, schemas, migrations, backups, cluster data, receipts, tests, curriculum/question content, native dependencies and existing user changes.

Nine launcher `.bak` files, root Lovable template, Bun/Replit configuration, screenshots, attached historical request, literal `%SystemDrive%` cache files and all inaccessible evidence were outside approval and remain unchanged. Unique/documentation-linked compiled outputs and the pre-cleanup/current verification builds remain.

The following retained identical output counterparts cover every deleted build file:

- Removed files under `.local/admin-ui-production-build/1791899692234`; matching originals retained under `.local/admin-ui-production-build/1791899242513`.
- Removed files under `.local/admin-ui-production-build/1791904684565`; matching originals retained under `.local/admin-ui-production-build/1791899242513`.
- Removed files under `.local/admin-ui-production-build/1791910872322`; matching originals retained under `.local/admin-ui-production-build/1791960784094`.
- Removed files under `.local/admin-ui-production-build/1791911689242`; matching originals retained under `.local/admin-ui-production-build/1791960784094`.
- Removed files under `.local/admin-ui-production-build/1791960529194`; matching originals retained under `.local/admin-ui-production-build/1791960784094`.
- Removed files under `.local/admin-ui-production-build/1791963740291`; matching originals retained under `.local/admin-ui-production-build/1791960784094`.
- Removed files under `.local/admin-ui-production-build/1792042367664`; matching originals retained under `.local/admin-ui-production-build/1792042820144`.
- Removed files under `.local/admin-ui-production-build/1792231435945`; matching originals retained under `.local/admin-ui-production-build/1792231352656`.
- Removed files under `.local/admin-ui-production-build/1792262532062`; matching originals retained under `.local/admin-ui-production-build/1792244487395`.

No database or application data was modified. No dependency installation, migration, grant, reset, seed, Git branch/index change, commit or push occurred.
