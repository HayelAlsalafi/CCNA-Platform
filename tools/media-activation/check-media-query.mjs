// Execute the actual authorization SELECT against synthetic CTEs on the pinned
// private server only. READ ONLY; no tables, roles, data or HBA are changed.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {runningPrivate,assertPrivateIdentity,isolated} from '../study-activation/isolated-policy.mjs';
const state=runningPrivate(process.cwd()),req=createRequire(path.resolve('lib/db/package.json'));
const c=new(req('pg').Client)({host:'127.0.0.1',port:55440,database:'postgres',user:isolated.owner,ssl:false,password:async()=>{throw Error('Credentials refused');},connectionTimeoutMillis:5000,query_timeout:10000});
try {
  await c.connect();await c.query('BEGIN READ ONLY');await assertPrivateIdentity(c,'postgres',state.data);
  const source=readFileSync('artifacts/api-server/src/lib/lesson-media.ts','utf8');
  const query=source.match(/sql`(SELECT m\.storage_key[\s\S]*?)`/)[1].replaceAll('${id}','$1').replaceAll('${admin}','$2').replaceAll('public.','');
  const fixture=`WITH lesson_media AS (SELECT $1::uuid AS id,'fixture.webp'::text AS storage_key,'image/webp'::text AS mime,'fixture-hash'::text AS sha256 WHERE $5::boolean),
  lessons AS (SELECT $1::uuid AS id,$1::uuid AS published_revision_id,$1::uuid AS chapter_id WHERE $3::boolean),
  lesson_revisions AS (SELECT $1::uuid AS id,$1::uuid AS lesson_id,jsonb_build_object('chapterId',$1::text,'blocks',jsonb_build_array(jsonb_build_object('url','/api/lesson-media/' || $1::text))) AS snapshot),
  curriculum_chapters AS (SELECT $1::uuid AS id,$1::uuid AS blueprint_id),
  topics AS (SELECT $1::uuid AS id,CASE WHEN $4::boolean THEN 'ACTIVE' ELSE 'INACTIVE' END AS status),
  exam_blueprints AS (SELECT $1::uuid AS id,'ACTIVE'::text AS status) `;
  const outcomes={};
  for(const [name,admin,published,active,found,count] of [['adminDraft',true,false,true,true,1],['learnerPublished',false,true,true,true,1],['learnerDraftDenied',false,false,true,true,0],['learnerInactiveDenied',false,true,false,true,0],['missingDenied',true,true,true,false,0]]){
    const result=await c.query(fixture+query,['11111111-1111-4111-8111-111111111111',admin,published,active,found]);assert.equal(result.rows.length,count);outcomes[name]='PASS';
  }
  console.log(JSON.stringify({target:'private-postgres:55440/postgres',readOnly:true,mainConnections:0,databaseWrites:0,outcomes}));
} finally {await c.query('ROLLBACK').catch(()=>{});await c.end();}
