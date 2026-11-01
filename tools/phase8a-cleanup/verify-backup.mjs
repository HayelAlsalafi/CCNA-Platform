import {portableRoot,workspaceRoot} from "../workspace-root.mjs";
// Separate authorization required for the temporary private-cluster HBA allowance.
// No database creation, migration, grants, role changes or rehearsal-data access.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, realpathSync, readdirSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { createHash } from 'node:crypto';
import { orderedRestoreSql } from './final-planner.mjs';
import { privateHba } from "../taxonomy-rehearsal/safety.mjs";
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
const database = "ccna_drizzle_check_20261012_c08f12ad34b6",
  owner = "ccna_taxonomy_rehearsal_owner_8e6c4b9a2170",
  existing = "ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170";
const data = path.join(root, ".local/taxonomy-rehearsal", existing, "data");
const rule = `host ${database} ${owner} 127.0.0.1/32 trust`;

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
const currentLines=original.toString('utf8').trim().split(/\r?\n/);
const withRule=[...lines];withRule.splice(3,0,rule);
const alreadyInstalled=JSON.stringify(currentLines)===JSON.stringify(withRule);
assert(alreadyInstalled||JSON.stringify(currentLines)===JSON.stringify(lines),'Unexpected HBA policy; refuse modification');
lines.splice(3, 0, rule);
const changed = Buffer.from(lines.join("\n") + "\n");
const [operation,archiveArg,proofArg]=process.argv.slice(2);
assert.equal(operation,'--verify-rollback-restoration');assert.equal(process.argv.length,5);
const archive=realpathSync(archiveArg),proofPath=realpathSync(proofArg);
const parent=realpathSync(path.join(root,'.local/final-legacy-cleanup'));
for(const file of [archive,proofPath])assert(canonical(file).startsWith(canonical(parent)+'/'),'Unexpected backup/proof path');
assert.equal(path.dirname(archive),path.dirname(proofPath));assert.equal(path.basename(archive),'before-cleanup.dump');assert.equal(path.basename(proofPath),'restore-proof-input.json');
const proof=JSON.parse(readFileSync(proofPath,'utf8'));
assert.equal(createHash('sha256').update(readFileSync(archive)).digest('hex'),proof.sha256);
const tables=['users','topics','questions','question_options','question_revisions','practice_deliveries','practice_attempts','exam_blueprints','exam_domains','exam_objectives','question_objectives'];
assert.deepEqual(Object.keys(proof.tables).sort(),[...tables].sort());
for(const value of Object.values(proof.tables))assert(Number.isSafeInteger(value.count)&&value.count>=0&&/^[a-f0-9]{64}$/.test(value.hash));
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(SYSTEMROOT|WINDIR|COMSPEC|PATH|PATHEXT|USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i.test(key)));
const bin='C:/Program Files/PostgreSQL/18/bin';
const reload=()=>execFileSync(path.join(bin,'pg_ctl.exe'),['-D',data,'reload'],{env,stdio:'pipe',timeout:10000,windowsHide:true});
let installed=false;
try{
  if(!alreadyInstalled){writeFileSync(hba,changed);installed=true;reload();}
  let restore=execFileSync(path.join(bin,'pg_restore.exe'),['--data-only','--no-owner','--no-privileges','--schema=public',...tables.flatMap(t=>['--table',t]),'--file=-',archive],{env,encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024,windowsHide:true});
  restore=orderedRestoreSql(restore,tables);
  const empty=tables.map(t=>`IF EXISTS(SELECT 1 FROM public.${t}) THEN RAISE EXCEPTION 'Restoration target not empty'; END IF;`).join('\n');
  const verify=tables.map(t=>`IF (SELECT count(*) FROM public.${t})<>${proof.tables[t].count} OR (SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') FROM public.${t} t)<>'${proof.tables[t].hash}' THEN RAISE EXCEPTION 'Restored table mismatch: ${t}'; END IF;`).join('\n');
  const query=`BEGIN; SET LOCAL TimeZone='UTC'; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='120s';
    DO $guard$ BEGIN IF current_database()<>'${database}' OR session_user<>'${owner}' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440 OR current_setting('server_version_num')<>'180006' OR replace(current_setting('data_directory'),chr(92),'/')<>'${data.replaceAll('\\','/')}' OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>'${owner}' THEN RAISE EXCEPTION 'Restoration identity mismatch'; END IF; END $guard$;
    LOCK TABLE ${tables.map(t=>'public.'+t).join(',')} IN SHARE ROW EXCLUSIVE MODE;
    DO $empty$ BEGIN ${empty} END $empty$;
    -- Historical pre-0004 attempts must be restored before their new-insert rule.
    -- This exact INSERT trigger suspension is disposable-only and rolls back.
    ALTER TABLE public.practice_attempts DISABLE TRIGGER practice_attempts_validate_revision;
    ${restore}
    ALTER TABLE public.practice_attempts ENABLE TRIGGER practice_attempts_validate_revision;
    SET CONSTRAINTS ALL IMMEDIATE;
    DO $verify$ BEGIN ${verify} END $verify$;
    ROLLBACK;
    DO $empty$ BEGIN ${empty} END $empty$;
    SELECT 'CCNA_BACKUP_RESTORE_VERIFIED';`;
  const result=spawnSync(path.join(bin,'psql.exe'),['--host=127.0.0.1','--port=55440','--username='+owner,'--dbname='+database,'--no-password','--no-psqlrc','--set=ON_ERROR_STOP=1','--quiet','--tuples-only','--no-align','--file=-'],{input:query,env,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:1024*1024});
  assert(!result.error&&result.status===0&&result.stdout.includes('CCNA_BACKUP_RESTORE_VERIFIED'),'Rollback restoration failed; preserve archive. Raw data/tool output withheld.');
  console.log(JSON.stringify({restoreVerified:true,database,port:55440,tablesVerified:tables.length,allRowsAndHashesMatched:true,rolledBack:true,sequenceRestored:false}));
}finally{
  if(installed){assert(readFileSync(hba).equals(changed),'HBA changed externally; refuse overwrite.');writeFileSync(hba,original);reload();assert(readFileSync(hba).equals(original));}
}
