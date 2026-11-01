import {portableRoot,workspaceRoot} from "./workspace-root.mjs";
// Separate authorization required for the temporary private-cluster HBA allowance.
// No database creation, grants, role changes or populated rehearsal-data access.
// Only explicit --execute-nexus/--execute-learning apply pinned proposals inside rollback-only tests.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, realpathSync, readdirSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { privateHba } from "./taxonomy-rehearsal/safety.mjs";
import {assertNexusSource,nexusMigration} from './nexus-policy.mjs';
import {migrationManifest} from './phase6a-local/policy.mjs';
import {assertLearningSource,learningMigration} from './learning-policy.mjs';
import {createHash} from 'node:crypto';
const root = realpathSync(process.cwd()),
  canonical = (s) => s.replaceAll("\\", "/").toLowerCase();
assert.equal(canonical(root), portableRoot.toLowerCase());
assert.equal(
  execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim(),
  "main",
);
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  "03b14526aae448e49eacd602a43bfb0e355aca4d",
);
const mode = process.argv[2] ?? "--plan";
assert(
  process.argv.length <= 3 && ["--plan", "--execute-isolated", "--execute-studio", "--execute-nexus", "--execute-learning", "--execute-editor"].includes(mode),
);
const database = "ccna_drizzle_check_20261012_c08f12ad34b6",
  owner = "ccna_taxonomy_rehearsal_owner_8e6c4b9a2170",
  existing = "ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170";
const data = path.join(root, ".local/taxonomy-rehearsal", existing, "data");
const rule = `host ${database} ${owner} 127.0.0.1/32 trust`;
const summary = {
  database,
  owner,
  host: "127.0.0.1",
  port: 55440,
  temporaryHbaRule: rule,
  applicationDatabaseConnections: 0,
  rehearsalDatabaseConnections: 0,
  newDatabases: 0,
  migrations: mode === '--execute-editor' ? 'Proposals 0007-0009, rollback-only official migrator and repeat run' : mode === '--execute-learning' ? 'Proposals 0007 and 0008, rollback-only official migrator and repeat run' : mode === '--execute-nexus' ? 'Proposed 0007 inside a rollback-only transaction; official Drizzle migrator and repeat run' : "None; requires the exact existing seven-entry test ledger",
  fixtureGroups:
    mode === '--execute-editor' ? 'Admin editor multiple answers and relationship persistence' : mode === '--execute-learning' ? 'Learning evidence, atomic final submission and achievement integration' : mode === '--execute-nexus' ? 'Nexus migration and persistent-session integration' : mode === "--execute-studio"
      ? "Question studio, topics management and protected-history deletion regressions"
      : "Full isolated test suite",
  fixtureTransactions: "ROLLBACK ONLY",
  isolatedSequence:
    "Fixture inserts and migration checks can advance only this disposable database's question-code and ledger sequences; PostgreSQL sequences do not roll back.",
};
if (mode === "--plan") {
  console.log(JSON.stringify({ ...summary, databaseOperations: 0 }, null, 2));
  process.exit(0);
}
if(mode==='--execute-nexus'||mode==='--execute-learning'){
  const proposal=assertNexusSource(root),manifest=migrationManifest(root);
  assert([7,8,9].includes(manifest.length),'Only reviewed source inventories are accepted');
  const folder=path.join(root,mode==='--execute-learning'?'.local/learning-migration':'.local/nexus-migration');
  assert.equal(readFileSync(path.join(folder,'0007_nexus_sessions.sql'),'utf8'),proposal,'Staged SQL differs from pinned proposal');
  for(const file of manifest.slice(0,7))assert.equal(createHash('sha256').update(readFileSync(path.join(folder,file.tag+'.sql'))).digest('hex'),file.hash,'Staged historical source changed');
  const staged=JSON.parse(readFileSync(path.join(folder,'meta/_journal.json'),'utf8'));
  const current=JSON.parse(readFileSync(path.join(root,'lib/db/drizzle/meta/_journal.json'),'utf8'));const original={...current,entries:current.entries.slice(0,7)};
  const extra=[{idx:7,version:'7',when:nexusMigration[1],tag:nexusMigration[0],breakpoints:true}];
  if(mode==='--execute-learning'){assert.equal(readFileSync(path.join(folder,'0008_learning_achievements.sql'),'utf8'),assertLearningSource(root).toString('utf8'));extra.push({idx:8,version:'7',when:learningMigration[1],tag:learningMigration[0],breakpoints:true});}
  assert.deepEqual(staged,{...original,entries:[...original.entries,...extra]});
}
if(mode==='--execute-editor'){
  const manifest=migrationManifest(root),folder='.local/editor-migration';
  const current=JSON.parse(readFileSync('lib/db/drizzle/meta/_journal.json','utf8'));
  const extras=[{idx:7,version:'7',when:nexusMigration[1],tag:nexusMigration[0],breakpoints:true},{idx:8,version:'7',when:learningMigration[1],tag:learningMigration[0],breakpoints:true},{idx:9,version:'7',when:1792108800000,tag:'0009_multiple_answer_questions',breakpoints:true}];
  assert.deepEqual(JSON.parse(readFileSync(folder+'/meta/_journal.json','utf8')),{...current,entries:[...current.entries.slice(0,7),...extras]});
  for(const e of manifest.slice(0,7))assert.equal(createHash('sha256').update(readFileSync(folder+'/'+e.tag+'.sql')).digest('hex'),e.hash);
  assert.equal(readFileSync(folder+'/0007_nexus_sessions.sql','utf8'),assertNexusSource(root));
  assert.equal(readFileSync(folder+'/0008_learning_achievements.sql','utf8'),assertLearningSource(root).toString('utf8'));
  for(const location of ['lib/db/drizzle/proposed/','.local/editor-migration/'])assert.equal(createHash('sha256').update(readFileSync(location+'0009_multiple_answer_questions.sql')).digest('hex'),'cd2ea484ba1b6f850eb1f64b95fbe91869deecd2093061e05336588819492cef');
}
assert.equal(canonical(realpathSync(data)), canonical(data));
const marker = JSON.parse(
  readFileSync(path.join(data, "../owner.json"), "utf8").replace(/^\uFEFF/, ""),
);
assert.deepEqual(marker, {
  nonce: "8e6c4b9a2170",
  database: existing,
  owner,
  port: 55440,
  dataDirectory: data,
});
const pid = readFileSync(path.join(data, "postmaster.pid"), "utf8").trim().split(/\r?\n/);
assert.equal(canonical(pid[1]), canonical(data));
assert.equal(Number(pid[3]), 55440);
const listener = JSON.parse(
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "$x=@(Get-NetTCPConnection -LocalPort 55440 -State Listen -ErrorAction Stop); if($x.Count -ne 1){throw 'Unexpected listener'}; [pscustomobject]@{host=$x[0].LocalAddress;pid=$x[0].OwningProcess;exe=(Get-Process -Id $x[0].OwningProcess).Path}|ConvertTo-Json -Compress",
    ],
    { encoding: "utf8", timeout: 15000 },
  ),
);
assert.equal(listener.host, "127.0.0.1");
assert.equal(listener.pid, Number(pid[0]));
assert.equal(canonical(listener.exe), "c:/program files/postgresql/18/bin/postgres.exe");
assert.match(
  execFileSync("C:/Program Files/PostgreSQL/18/bin/postgres.exe", ["--version"], {
    encoding: "utf8",
    timeout: 5000,
  }),
  /18\.6/,
);
const hba = path.join(data, "pg_hba.conf"),
  original = readFileSync(hba),
  lines = privateHba(existing, owner);
assert.deepEqual(
  original.toString("utf8").trim().split(/\r?\n/),
  lines,
  "Unexpected HBA policy; refuse modification",
);
lines.splice(3, 0, rule);
const changed = Buffer.from(lines.join("\n") + "\n");
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    /^(SYSTEMROOT|WINDIR|COMSPEC|PATH|PATHEXT|USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i.test(
      key,
    ),
  ),
);
env.RUN_ADMIN_PRACTICE_DISPOSABLE_TESTS = "1";
if(mode==='--execute-editor')env.RUN_EDITOR_DISPOSABLE_TESTS='1';
if(mode==='--execute-nexus')env.RUN_NEXUS_DISPOSABLE_TESTS='1';
if(mode==='--execute-learning')env.RUN_LEARNING_DISPOSABLE_TESTS='1';
env.ESBUILD_BINARY_PATH = path.join(
  root,
  ".local/native-deps/node_modules/.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe",
);
const folder = readdirSync(path.join(root, "node_modules/.pnpm")).find((n) =>
  n.startsWith("vitest@3.2.7_"),
);
assert(folder, "Installed Vitest missing");
const cli = path.join(root, "node_modules/.pnpm", folder, "node_modules/vitest/vitest.mjs");
const reload = () =>
  execFileSync("C:/Program Files/PostgreSQL/18/bin/pg_ctl.exe", ["-D", data, "reload"], {
    env,
    stdio: "pipe",
    timeout: 10000,
  });
let installed = false;
try {
  writeFileSync(hba, changed);
  installed = true;
  reload();
  const result = spawnSync(
    process.execPath,
    [
      cli,
      "run",
      "--config",
      "tools/admin-practice-disposable.config.mjs",
      "--reporter=verbose",
      ...(mode === '--execute-editor' ? ['--testNamePattern','Admin editor:'] : mode === '--execute-learning' ? ['--testNamePattern','Learning evidence:'] : mode === '--execute-nexus' ? ['--testNamePattern','Nexus sessions'] : mode === "--execute-studio"
        ? [
            "--testNamePattern",
            "question studio SQL|topics management SQL|explicit session-bound history confirmation",
          ]
        : []),
    ],
    {
      cwd: root,
      env,
      encoding: "utf8",
      windowsHide: true,
      timeout: 90000,
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error) throw Error("Isolated fixture runner failed or exceeded its bounded deadline.");
  process.exitCode = result.status ?? 1;
} finally {
  if (installed) {
    assert(
      readFileSync(hba).equals(changed),
      "HBA changed externally; refuse to overwrite it. Preserve original policy for reviewed recovery.",
    );
    writeFileSync(hba, original);
    reload();
    assert(readFileSync(hba).equals(original));
    console.log(JSON.stringify({ ...summary, hbaRestoredByteForByte: true }));
  }
}
