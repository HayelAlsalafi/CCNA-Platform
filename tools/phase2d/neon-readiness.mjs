import {portableRoot,workspaceRoot} from "../workspace-root.mjs";
// SELECT-only assessment. Never imports the application or a migration executor.
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
import path from "node:path";
import {validateInput,connection,assertIdentity,migrationManifest} from "../phase6a-local/policy.mjs";
import {withReadOnlyUtc} from "../study-activation/read-only-utc.mjs";
const tables=["achievement_definitions","curriculum_chapters","exam_blueprints","exam_domains","exam_objectives","learner_achievements","learning_session_items","learning_sessions","lesson_annotations","lesson_media","lesson_progress","lesson_revisions","lessons","practice_attempts","practice_deliveries","question_deletion_audits","question_objectives","question_options","question_revisions","questions","topics","users"];
let raw,stage="offline-target-check";
const digest=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
try {
  assert.deepEqual(process.argv.slice(2),["--read-only"]);
  assert.equal(path.resolve(process.cwd()).replaceAll("\\","/").toLowerCase(),portableRoot.toLowerCase());
  const manifest=migrationManifest(process.cwd());assert.equal(manifest.length,14);
  const chunks=[];let bytes=0;for await(const chunk of process.stdin){bytes+=chunk.length;assert(bytes<=16384);chunks.push(chunk);}
  const config=validateInput("upgrade-check",JSON.parse(Buffer.concat(chunks).toString("utf8")));
  const require=createRequire(path.resolve("lib/db/package.json"));raw=new(require("pg").Client)({...connection(config),application_name:"ccna-phase2d-select-only",options:"-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=2000"});raw.on("error",()=>{});
  await raw.connect();stage="read-only-snapshot";
  const select=async(sql,params)=>{assert(/^\s*SELECT\b/i.test(sql)&&! /;\s*\S/.test(sql));return raw.query(sql,params);};
  const report=await withReadOnlyUtc(raw,async()=>{
    const identity=(await select("SELECT local_runtime_guard.identity() AS identity")).rows[0].identity;assertIdentity(identity,config);
    const ledger=(await select('SELECT id,hash,created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at,id')).rows;
    assert.equal(ledger.length,14);for(let i=0;i<manifest.length;i++){assert.equal(ledger[i].hash,manifest[i].hash);assert.equal(ledger[i].created_at,String(manifest[i].when));}
    const inventory=(await select("SELECT c.relname AS name,c.relkind AS kind,r.rolname AS owner,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') ORDER BY c.relname")).rows;
    assert.deepEqual(inventory.map(row=>row.name),tables);assert(inventory.every(row=>row.kind==='r'&&row.owner===config.role));
    const counts={};for(const table of tables)counts[table]=Number((await select(`SELECT count(*)::text AS count FROM public."${table}"`)).rows[0].count);
    const metadata={
      extensions:(await select("SELECT extname,extversion FROM pg_extension ORDER BY extname")).rows,
      databaseBytes:Number((await select("SELECT pg_database_size(current_database())::text AS bytes")).rows[0].bytes),
      constraints:(await select("SELECT conname,contype,conrelid::regclass::text AS relation,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conname")).rows,
      indexes:(await select("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname")).rows,
      sequences:(await select("SELECT schemaname,sequencename,start_value,min_value,max_value,increment_by,last_value FROM pg_sequences WHERE schemaname IN ('public','drizzle') ORDER BY schemaname,sequencename")).rows,
      triggers:(await select("SELECT t.tgname,c.relname AS relation,t.tgenabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace='public'::regnamespace ORDER BY c.relname,t.tgname")).rows,
      functions:(await select("SELECT n.nspname,p.proname,p.prosecdef,p.proconfig,r.rolname AS owner,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname IN ('public','local_runtime_guard') AND p.prokind='f' ORDER BY n.nspname,p.proname,p.oid")).rows.map(({definition,...row})=>({...row,definitionSha256:digest(definition)})),
      policies:(await select("SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname")).rows,
      roles:(await select("SELECT rolname,rolsuper,rolinherit,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname IN ('ccna_phase6a_app','ccna_phase6a_migrator') ORDER BY rolname")).rows,
      grants:(await select("SELECT grantee,table_name,privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('ccna_phase6a_app','ccna_phase6a_migrator') ORDER BY grantee,table_name,privilege_type")).rows,
      userMapping:(await select("SELECT count(*)::int AS users,count(*) FILTER(WHERE clerk_user_id IS NULL OR clerk_user_id='')::int AS missing_mappings,count(DISTINCT clerk_user_id)::int AS distinct_mappings FROM public.users")).rows[0],
    };
    assert(metadata.roles.every(row=>!row.rolsuper&&!row.rolbypassrls));
    return {identity,ledgerEntries:ledger.length,ledgerMatched:true,tables:inventory,counts,...metadata,metadataSha256:digest(metadata)};
  });
  const folder=path.resolve(".local/phase2d",new Date().toISOString().replace(/[:.]/g,"-"));mkdirSync(folder,{recursive:true});const file=path.join(folder,"neon-readiness.json");
  const result={stage:"complete",...report,databaseWrites:0,migrationExecuted:false,externalConnections:0,report:file};writeFileSync(file,JSON.stringify(result,null,2),{flag:"wx"});
  console.log(JSON.stringify({stage:result.stage,identity:report.identity,ledgerEntries:14,tables:22,counts:report.counts,databaseBytes:report.databaseBytes,extensions:report.extensions,databaseWrites:0,report:file}));
} catch(error){console.log(JSON.stringify({stage,databaseWrites:0,failure:{code:/^[A-Z0-9]{5}$/.test(error?.code??"")?error.code:null,message:"Read-only assessment stopped; credentials and raw server output withheld. Do not retry automatically."}}));process.exitCode=1;}
finally{await raw?.end().catch(()=>{});}
