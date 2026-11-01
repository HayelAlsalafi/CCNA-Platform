// New private fixture DB only; no main connection, role creation or S3 access.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {runningPrivate,assertPrivateIdentity,isolated,bin} from '../study-activation/isolated-policy.mjs';
import {assertDeletionProposal,assertDeletionFunction} from './policy.mjs';
import {rowProof} from '../question-bank-upgrade-core.mjs';
const root=process.cwd(),database='ccna_lesson_delete_0016_'+randomUUID().replaceAll('-','').slice(0,24),role='pg_read_all_settings';
assertDeletionProposal(root);assert.equal(process.argv[2],'--rehearse');assert.equal(process.argv.length,3);
const state=runningPrivate(root),changed=Buffer.from([...state.lines.slice(0,3),`host ${database} ${isolated.owner} 127.0.0.1/32 trust`,...state.lines.slice(3)].join('\n')+'\n');
const reload=()=>execFileSync(bin+'pg_ctl.exe',['-D',state.data,'reload'],{env:state.env,stdio:'pipe',timeout:10000,windowsHide:true});
const req=createRequire(path.join(root,'lib/db/package.json')),clients=[];
async function connect(db){assert(['postgres',database].includes(db));const c=new(req('pg').Client)({host:'127.0.0.1',port:55440,database:db,user:isolated.owner,ssl:false,password:async()=>{throw Error('Credentials refused');},connectionTimeoutMillis:5000,query_timeout:15000});clients.push(c);await c.connect();await assertPrivateIdentity(c,db,state.data);return c;}
const report={mainConnections:0,mainWrites:0,storageOperations:0,database,outcomes:{}};let stage='private-fixture-creation';
try{
 writeFileSync(state.hba,changed);reload();const maintenance=await connect('postgres');assert.equal((await maintenance.query('SELECT count(*)::int AS n FROM pg_database WHERE datname=$1',[database])).rows[0].n,0);
 await maintenance.query(`CREATE DATABASE "${database}" OWNER "${isolated.owner}" TEMPLATE template0`);const c=await connect(database);
 assert.equal((await c.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'")).rows[0].n,0);
 await c.query('CREATE TABLE public.users(id uuid PRIMARY KEY,role text NOT NULL,status text NOT NULL); CREATE TABLE public.curriculum_chapters(id uuid PRIMARY KEY)');
 for(const file of ['0013_learning_lessons.sql','0014_interactive_study.sql','0015_lesson_media_library.sql'])await c.query(readFileSync(path.join(root,'lib/db/drizzle',file),'utf8'));
 const proposal=readFileSync(path.join(root,'lib/db/drizzle/proposed/0016_safe_lesson_deletion.sql'),'utf8');
 await c.query(proposal.replace('TO ccna_phase6a_app;',`TO ${role};`));
 await c.query(`GRANT USAGE ON SCHEMA public TO ${role}`);await assertDeletionFunction(c,root,isolated.owner,role);
 report.outcomes.functionSecurity='PASS';
 assert.equal((await c.query('SELECT has_table_privilege($1,\'public.lessons\',\'DELETE\') AS allowed',[role])).rows[0].allowed,false);
 const admin=randomUUID(),learner=randomUUID(),chapter=randomUUID();await c.query("INSERT INTO public.users VALUES($1,'ADMIN','ACTIVE'),($2,'USER','ACTIVE');",[admin,learner]);await c.query('INSERT INTO public.curriculum_chapters VALUES($1)',[chapter]);
 const ids=Object.fromEntries(['eligible','published','history','progress','annotations','reference','publishedReference','encodedReference','rollback','concurrent','unreviewed'].map(n=>[n,randomUUID()]));
 for(const [name,id] of Object.entries(ids))await c.query('INSERT INTO public.lessons(id,chapter_id,title,created_by,updated_by) VALUES($1,$2,$3,$4,$4)',[id,chapter,name,admin]);
 for(const name of ['published','history','progress','annotations']){const revision=randomUUID();await c.query('INSERT INTO public.lesson_revisions(id,lesson_id,revision_number,snapshot,created_by) VALUES($1,$2,1,$3,$4)',[revision,ids[name],JSON.stringify({chapterId:chapter,blocks:[]}),admin]);if(name==='published')await c.query('UPDATE public.lessons SET published_revision_id=$1 WHERE id=$2',[revision,ids[name]]);if(name==='progress')await c.query("INSERT INTO public.lesson_progress(user_id,lesson_id,revision_id,state) VALUES($1,$2,$3,'IN_PROGRESS')",[learner,ids[name],revision]);if(name==='annotations')await c.query("INSERT INTO public.lesson_annotations(user_id,lesson_id,revision_id,kind,body) VALUES($1,$2,$3,'NOTE','Private fixture')",[learner,ids[name],revision]);}
 const referring=randomUUID();await c.query('INSERT INTO public.lessons(id,chapter_id,title,created_by,updated_by,blocks) VALUES($1,$2,\'referring\',$3,$3,$4)',[referring,chapter,admin,JSON.stringify([{url:'/learn/chapters/'+chapter+'/lessons/'+ids.reference},{url:'/learn/chapters/'+chapter+'/lessons/'+[...ids.encodedReference].map(v=>'%'+v.charCodeAt(0).toString(16)).join('')}])]);
 await c.query('INSERT INTO public.lesson_revisions(lesson_id,revision_number,snapshot,created_by) VALUES($1,1,$2,$3)',[referring,JSON.stringify({blocks:[{url:'/learn/chapters/'+chapter+'/lessons/'+ids.publishedReference}]}),admin]);
 const media=randomUUID();await c.query("INSERT INTO public.lesson_media(id,created_by,storage_key,mime,bytes,sha256) VALUES($1,$2,$3,'image/webp',1,$4)",[media,admin,media+'.webp','a'.repeat(64)]);
 await c.query('UPDATE public.lessons SET blocks=$1 WHERE id=$2',[JSON.stringify([{type:'image',url:'/api/lesson-media/'+media}]),ids.eligible]);
 const protectedTables=['users','curriculum_chapters','lesson_revisions','lesson_progress','lesson_annotations','lesson_media'];await c.query("SET TIME ZONE 'UTC'");const before=await rowProof(c,protectedTables);
 async function call(client,id,actor=admin,version=1,title=Object.keys(ids).find(k=>ids[k]===id)){return client.query('SELECT public.delete_never_published_lesson($1,$2,$3,$4) AS result',[id,actor,version,title]);}
 async function denied(name,code,constraint,actor=admin,version=1,title=name){await c.query('SAVEPOINT denial');let rejected=false;try{await call(c,ids[name],actor,version,title);}catch(e){assert.equal(e.code,code);if(constraint)assert.equal(e.constraint,constraint);rejected=true;}assert(rejected);await c.query('ROLLBACK TO SAVEPOINT denial');}
 stage='protected-cases';await c.query('BEGIN');await c.query(`SET LOCAL ROLE ${role}`);
 for(const [name,category] of [['published','published'],['history','revisions'],['progress','progress'],['annotations','annotations'],['reference','content_reference'],['publishedReference','content_reference'],['encodedReference','content_reference']])await denied(name,'23514','lesson_delete_'+category);
 await denied('eligible','42501',null,learner);await denied('eligible','40001',null,admin,2);await denied('eligible','22023',null,admin,1,'wrong title');await c.query('ROLLBACK');report.outcomes.protectedAndUnauthorizedCases='PASS';
 stage='rollback';await c.query('BEGIN');await c.query(`SET LOCAL ROLE ${role}`);assert.equal((await call(c,ids.rollback)).rows[0].result.deleted,true);await c.query('ROLLBACK');assert.equal((await c.query('SELECT count(*)::int AS n FROM public.lessons WHERE id=$1',[ids.rollback])).rows[0].n,1);report.outcomes.rollback='PASS';
 stage='delete';await c.query(`SET ROLE ${role}`);assert.equal((await call(c,ids.eligible)).rows[0].result.id,ids.eligible);await c.query('RESET ROLE');assert.equal((await c.query('SELECT count(*)::int AS n FROM public.lessons WHERE id=$1',[ids.eligible])).rows[0].n,0);report.outcomes.eligibleDraft='PASS';
 stage='unknown-reference';await c.query('BEGIN');await c.query('CREATE TABLE public.unreviewed_fixture(id uuid REFERENCES public.lessons(id) ON DELETE CASCADE)');await denied('unreviewed','23514','lesson_delete_unknown_dependency');await c.query('ROLLBACK');report.outcomes.unknownCascadeDependencyBlocked='PASS';
 stage='concurrency';const a=await connect(database),b=await connect(database);await a.query('BEGIN');await a.query(`SET LOCAL ROLE ${role}`);await call(a,ids.concurrent);await b.query(`SET ROLE ${role}`);
 const second=call(b,ids.concurrent).then(()=>({code:'unexpected'}),e=>({code:e.code}));await a.query('COMMIT');assert.equal((await second).code,'P0002');report.outcomes.concurrentRequests='PASS';
 assert.deepEqual(await rowProof(c,protectedTables),before);report.outcomes.historyAndSharedMediaPreserved='PASS';report.classification='PASS';stage='complete';
}catch(error){report.classification='BLOCKED';report.failure={stage,sqlState:/^[A-Z0-9]{5}$/.test(error?.code??'')?error.code:null,message:'Stopped; fixture records and raw errors withheld. No automatic retry.'};process.exitCode=1;}
finally{
 for(const c of clients)await c.end().catch(()=>{});
 assert(readFileSync(state.hba).equals(changed),'Concurrent HBA change');writeFileSync(state.hba,state.original);reload();assert(readFileSync(state.hba).equals(state.original));report.hbaRestoredByteForByte=true;
 const folder=path.join(root,'.local/lesson-deletion',database);mkdirSync(folder,{recursive:true});const file=path.join(folder,'rehearsal.json');report.report=file;writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(report));
}
