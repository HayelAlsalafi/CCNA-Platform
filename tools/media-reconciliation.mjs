// Inert on import. Explicit operator-only READ ONLY PostgreSQL + S3 listing.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export function reconcileKeys(metadata, objects) {
  const referenced=new Set(metadata.flatMap(row=>[row.key,row.thumbnail_key,row.original_key].filter(Boolean).map(key=>key.startsWith("ccna-lessons/")?key:`ccna-lessons/${key}`)));
  const stored=new Set(objects);
  for(const key of [...referenced,...stored]) assert(/^ccna-lessons\/[A-Za-z0-9_./-]+$/.test(key)&&!key.includes('..'),'Unexpected object key; stop');
  return {referenced:referenced.size,objects:stored.size,missing:[...referenced].filter(k=>!stored.has(k)).sort(),
    orphanCandidates:[...stored].filter(k=>!referenced.has(k)).sort()};
}
export async function main(args=process.argv.slice(2)) {
  const names=['MEDIA_RECONCILE_DATABASE_URL','LESSON_MEDIA_S3_ENDPOINT','LESSON_MEDIA_S3_REGION','LESSON_MEDIA_S3_BUCKET','LESSON_MEDIA_S3_ACCESS_KEY_ID','LESSON_MEDIA_S3_SECRET_ACCESS_KEY'];
  if(args.length===1&&args[0]==='--plan'){console.log(JSON.stringify({mode:'PLAN',databaseWrites:0,objectWrites:0,requiredEnvironmentNames:names,target:'127.0.0.1:5432/ccna_phase6a_dev',baseline:17}));return;}
  assert.deepEqual(args,['--check','--confirm-read-only-main-and-storage'],'Use --plan, or obtain approval for --check --confirm-read-only-main-and-storage');
  let client;
  try {
    for(const name of names)assert(process.env[name]?.trim(),`Missing ${name}`);
    const url=new URL(process.env.MEDIA_RECONCILE_DATABASE_URL);
    assert(['postgres:','postgresql:'].includes(url.protocol)&&url.hostname==='127.0.0.1'&&url.port==='5432'&&url.pathname==='/ccna_phase6a_dev'&&!url.search,'Unexpected database target');
    assert(['ccna_phase6a_app','ccna_phase6a_migrator'].includes(decodeURIComponent(url.username)),'Unexpected database role');
    const endpoint=new URL(process.env.LESSON_MEDIA_S3_ENDPOINT);
    assert(!endpoint.username&&!endpoint.password&&!endpoint.search&&!endpoint.hash,'Invalid object endpoint');
    assert(endpoint.protocol==='https:' || endpoint.origin==='http://127.0.0.1:9000','Unsafe object endpoint');
    assert.equal(process.env.LESSON_MEDIA_S3_BUCKET,'ccna-lesson-media');
    const require=createRequire(new URL('../artifacts/api-server/package.json',import.meta.url));
    const {Client}=require('pg'),{S3Client,ListObjectsV2Command}=require('@aws-sdk/client-s3');
    client=new Client({connectionString:process.env.MEDIA_RECONCILE_DATABASE_URL,application_name:'ccna-media-reconcile-read-only',connectionTimeoutMillis:5000});
    await client.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='2s'; SET LOCAL TIME ZONE 'UTC'");
    const identity=(await client.query('SELECT local_runtime_guard.identity() AS identity')).rows[0]?.identity;
    assert.equal(identity?.host,'127.0.0.1');assert.equal(identity.sessionRole,decodeURIComponent(url.username));assert.equal(identity.dataDirectory,'C:/Program Files/PostgreSQL/18/data');
    assert.equal(identity?.systemIdentifier,'7694701597474139084');assert.equal(identity.database,'ccna_phase6a_dev');assert.equal(identity.port,5432);assert.equal(identity.versionNumber,180006);
    const {migrationManifest,assertLedger}=await import('./phase6a-local/policy.mjs');
    const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const manifest=migrationManifest(root);assert.equal(manifest.length,17);
    assertLedger((await client.query('SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id')).rows,manifest);
    const metadata=(await client.query('SELECT storage_key AS key,thumbnail_key,original_key FROM public.lesson_media')).rows;
    await client.query('ROLLBACK');await client.end();client=null;
    const s3=new S3Client({endpoint:endpoint.href,region:process.env.LESSON_MEDIA_S3_REGION,forcePathStyle:true,maxAttempts:1,
      credentials:{accessKeyId:process.env.LESSON_MEDIA_S3_ACCESS_KEY_ID,secretAccessKey:process.env.LESSON_MEDIA_S3_SECRET_ACCESS_KEY}});
    const keys=[];let token;const tokens=new Set();
    try{do{const page=await s3.send(new ListObjectsV2Command({Bucket:process.env.LESSON_MEDIA_S3_BUCKET,Prefix:'ccna-lessons/',MaxKeys:1000,ContinuationToken:token}));
      keys.push(...(page.Contents??[]).map(o=>o.Key).filter(Boolean));assert(keys.length<=100000,'Object inventory limit exceeded');
      token=page.IsTruncated?page.NextContinuationToken:undefined;
      if(page.IsTruncated){assert(token&&!tokens.has(token),'Invalid pagination');tokens.add(token);}
    }while(token);}finally{s3.destroy();}
    console.log(JSON.stringify({mode:'READ_ONLY',databaseWrites:0,objectWrites:0,metadataRecords:metadata.length,...reconcileKeys(metadata,keys),
      warning:'Inventories are not atomic across services. Orphans are review candidates, never deletion authorization.'}));
  }catch{console.error(JSON.stringify({classification:'BLOCKED',databaseWrites:0,objectWrites:0,message:'Read-only reconciliation stopped; verify target, source baseline, environment names and permissions locally. Raw diagnostics withheld.'}));process.exitCode=1;}
  finally{if(client){await client.query('ROLLBACK').catch(()=>{});await client.end().catch(()=>{});}}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
