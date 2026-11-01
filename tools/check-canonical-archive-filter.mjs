import {portableRoot,workspaceRoot} from "./workspace-root.mjs";
﻿import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {sterileEnvironment} from './question-bank-disposable-access.mjs';
import {decodeArchiveTables} from './phase8a-cleanup/final-planner.mjs';
const archive=portableRoot + "/.local/question-bank-upgrade/2026-10-17T10-35-48.615Z/before-upgrade.dump";
if(createHash('sha256').update(readFileSync(archive)).digest('hex')!=='c5d15cc020e0fdb0cc83194b32c1a933287aa48bd8d465e103c3ade36399dabc')throw Error('Backup hash mismatch');
for(const selection of [['--table=public.users'],['--schema=public','--table=users']]){
 const sql=execFileSync('C:/Program Files/PostgreSQL/18/bin/pg_restore.exe',['--data-only',...selection,'--no-owner','--no-privileges','--file=-',archive],{env:sterileEnvironment(),encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:8*1024*1024});
 const tables=decodeArchiveTables(sql);
 console.log(JSON.stringify({selection,decodedTables:Object.keys(tables),userRows:tables.users?.length??0,connections:0}));
}
