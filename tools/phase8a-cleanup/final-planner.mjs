import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const fail=message=>{const e=Error(message);e.cleanupDiagnostic=true;throw e;};
export function reviewedInventory(){
  const bytes=readFileSync(new URL('./final-legacy-inventory.json',import.meta.url));
  if(createHash('sha256').update(bytes).digest('hex')!=='40513acec459cbc9b70a19ee1c62667717995853eb7c650f78aeffd27ba24f97')fail('Reviewed legacy inventory changed.');
  return JSON.parse(bytes);
}
export function finalPlan(preserved,questions,topics,inventory=reviewedInventory()){
  const pilot=preserved.map(q=>q.id).sort(), required=[...new Set(preserved.map(q=>q.topicId))].sort();
  const legacy=inventory.questions.map(q=>q.id).sort(), obsolete=inventory.topics.map(t=>t.id).sort();
  for(const [ids,n]of [[pilot,60],[required,24],[legacy,75],[obsolete,78]])if(ids.length!==n||new Set(ids).size!==n)fail('Exact reviewed record count/uniqueness failed.');
  if(legacy.some(id=>pilot.includes(id))||obsolete.some(id=>required.includes(id)))fail('Protected/obsolete record overlap.');
  if(JSON.stringify(questions.map(q=>q.id).sort())!==JSON.stringify([...pilot,...legacy].sort())||JSON.stringify(topics.map(t=>t.id).sort())!==JSON.stringify([...required,...obsolete].sort()))fail('Unexpected question/topic identity set; no automatic expansion.');
  for(const q of inventory.questions){const row=questions.find(r=>r.id===q.id),t=topics.find(t=>t.id===q.topicId);
    if(!row||row.topicId!==q.topicId||row.questionCode!==q.questionCode||row.status!==q.status||!t||t.name!==q.topicName||t.slug!==q.slug)fail('Legacy provenance changed: '+q.id);
  }
  for(const t of inventory.topics){const row=topics.find(r=>r.id===t.id);if(!row||row.name!==t.name||row.slug!==t.slug||row.status!==t.status)fail('Obsolete topic provenance changed: '+t.id);}
  return {preservedIds:pilot,requiredTopicIds:required,deleteQuestionIds:legacy,deleteTopicIds:obsolete};
}
export function decodeArchiveTables(sql){
  const decode=v=>v==='\\N'?null:v.replace(/\\([0-7]{1,3}|.)/g,(_,c)=>/^[0-7]+$/.test(c)?String.fromCharCode(parseInt(c,8)):({b:'\b',f:'\f',n:'\n',r:'\r',t:'\t',v:'\v'}[c]??c));
  const tables={};
  for(const b of sql.matchAll(/^COPY public\.(\w+) \(([^\n]+)\) FROM stdin;\r?\n([\s\S]*?)^\\\.\r?$/gm)){
    const columns=b[2].split(', ').map(c=>c.replaceAll('"',''));
    tables[b[1]]=b[3].trimEnd().split(/\r?\n/).filter(Boolean).map(line=>Object.fromEntries(line.split('\t').map((v,i)=>[columns[i],decode(v)])));
  }return tables;
}
export function orderedRestoreSql(sql,tables){
  const blocks=[...sql.matchAll(/^COPY public\.(\w+) \([^\n]+\) FROM stdin;\r?\n[\s\S]*?^\\\.\r?$/gm)];
  if(blocks.length!==tables.length||blocks.some(b=>!tables.includes(b[1])))fail('Unexpected restore COPY inventory.');
  return "SET client_encoding='UTF8';\nSET standard_conforming_strings=on;\n"+tables.map(t=>{
    const matches=blocks.filter(b=>b[1]===t);if(matches.length!==1)fail('Missing/duplicate restore COPY table '+t);return matches[0][0];
  }).join('\n')+'\n';
}
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
function rowKey(row){return JSON.stringify(Object.fromEntries(Object.keys(row).sort().map(key=>{
  let v=row[key];
  if(v!==null){
    if(key==='snapshot')v=canonical(typeof v==='string'?JSON.parse(v):v);
    else if(key.endsWith('_at')){
      const text=String(v).replace(' ','T').replace(/([+-]\d{2})$/,'$1:00');
      const fraction=text.match(/\.(\d+)(?:[+-]|Z)/)?.[1]?.replace(/0+$/,'')??'';
      const date=new Date(text);if(!Number.isFinite(date.valueOf()))fail('Invalid timestamp evidence.');
      // Normalize timezone offsets without discarding PostgreSQL microseconds.
      v=date.toISOString().replace(/\.\d{3}Z$/,fraction?'.'+fraction+'Z':'Z');
    }
    else if(typeof v==='boolean'||['is_correct','is_primary'].includes(key))v=v===true||v==='t'||v==='true'?'true':'false';
    else v=String(v);
  }return [key,v];
})));}
// The diagnostic uses exactly the same canonical comparison as the deletion
// guard. It provides evidence; it never approves drift or alters the baseline.
export function normalizedProvenanceRow(row){return JSON.parse(rowKey(row));}
export function reviewedProvenanceAmendments(){
  const bytes=readFileSync(new URL('./final-provenance-amendments.json',import.meta.url));
  if(createHash('sha256').update(bytes).digest('hex')!=='ef060c6b46041a6ef33a5a6bd7082b6c5978c9723ac95ef047fdb410120d1974')fail('Reviewed provenance amendment changed.');
  const proof=JSON.parse(bytes),inventory=reviewedInventory();
  if(proof.sourceArchiveSha256!==inventory.sourceArchiveHash||proof.diagnosticReportSha256!=='2d6e3503432c02b079137fcfc83a48eb64e4c0f4442f755650507755f406abb1'||proof.entries.length!==23)fail('Provenance evidence identity mismatch.');
  const identities=new Set();
  for(const e of proof.entries){
    const allowed=e.table==='questions'?inventory.questions:e.table==='topics'?inventory.topics:[];
    const identity=e.table+'/'+e.id+'/'+e.field;
    if(e.field!=='updated_at'||!allowed.some(r=>r.id===e.id)||identities.has(identity)||e.expected===e.actual||normalizedProvenanceRow({updated_at:e.expected}).updated_at!==e.expected||normalizedProvenanceRow({updated_at:e.actual}).updated_at!==e.actual)fail('Unreviewed provenance amendment.');
    identities.add(identity);
  }
  return proof.entries.map(e=>Object.freeze({...e}));
}
export function applyProvenanceAmendments(table,rows,plan,amendments){
  const selected=new Set(table==='questions'?plan.deleteQuestionIds:table==='topics'?plan.deleteTopicIds:[]);
  for(const e of amendments.filter(e=>e.table===table&&selected.has(e.id))){
    const matches=rows.filter(r=>r.id===e.id);
    if(e.field!=='updated_at'||!['questions','topics'].includes(table)||matches.length!==1||normalizedProvenanceRow({updated_at:matches[0].updated_at}).updated_at!==e.expected)fail('Original archive does not match exact provenance amendment: '+table+'/'+e.id);
    matches[0].updated_at=e.actual;
  }
  return rows;
}
export function disposableDifferences(plan,current,archived,inventory=reviewedInventory(),amendments=[]){
  const legacy=new Set(plan.deleteQuestionIds),obsolete=new Set(plan.deleteTopicIds),differences=[];
  for(const table of ['questions','topics','question_options','question_objectives','question_revisions','practice_deliveries','practice_attempts']){
    if(!current[table]||!archived[table])fail('Ownership evidence missing: '+table);
    const select=row=>table==='topics'?obsolete.has(row.id):table==='questions'?legacy.has(row.id):legacy.has(row.question_id);
    const before=archived[table].filter(select).map(row=>({...row}));
    for(const row of before){if(table==='questions')row.status=inventory.questions.find(q=>q.id===row.id).status;if(table==='topics')row.status=inventory.topics.find(t=>t.id===row.id).status;}
    applyProvenanceAmendments(table,before,plan,amendments);
    const identifier=row=>row.id??row.question_id+'/'+row.objective_id;
    const expected=new Map(),actual=new Map();
    for(const [map,rows]of [[expected,before],[actual,current[table].filter(select)]])for(const row of rows){const id=identifier(row);if(map.has(id))fail('Duplicate provenance row identity: '+table);map.set(id,row);}
    for(const id of [...new Set([...expected.keys(),...actual.keys()])].sort()){
      const old=expected.get(id),now=actual.get(id);
      if(!old||!now){differences.push({table,id,field:'__record__',expected:old?'PRESENT':'ABSENT',actual:now?'PRESENT':'ABSENT'});continue;}
      const a=normalizedProvenanceRow(old),b=normalizedProvenanceRow(now);
      for(const field of [...new Set([...Object.keys(a),...Object.keys(b)])].sort())if(JSON.stringify(a[field])!==JSON.stringify(b[field]))differences.push({table,id,field,expected:old[field],actual:now[field],normalizedExpected:a[field],normalizedActual:b[field]});
    }
  }return differences;
}
export function verifyDisposableOwnership(plan,current,archived,inventory=reviewedInventory(),amendments=reviewedProvenanceAmendments()){
  const legacy=new Set(plan.deleteQuestionIds),obsolete=new Set(plan.deleteTopicIds);
  const historical=['question_revisions','practice_deliveries','practice_attempts'];
  const counts={};
  for(const table of ['questions','topics','question_options','question_objectives',...historical]){
    if(!current[table]||!archived[table])fail('Ownership evidence missing: '+table);
    const select=row=>table==='topics'?obsolete.has(row.id):table==='questions'?legacy.has(row.id):legacy.has(row.question_id);
    const before=archived[table].filter(select).map(row=>({...row}));
    for(const row of before){
      if(table==='questions')row.status=inventory.questions.find(q=>q.id===row.id).status;
      if(table==='topics')row.status=inventory.topics.find(t=>t.id===row.id).status;
    }
    applyProvenanceAmendments(table,before,plan,amendments);
    const expected=before.map(rowKey).sort(),actual=current[table].filter(select).map(rowKey).sort();
    if(JSON.stringify(expected)!==JSON.stringify(actual))fail('Disposable records differ from verified backup: '+table+'. Stop for provenance review.');
    if(historical.includes(table))counts[table]=actual.length;
  }
  for(const r of current.question_revisions){const topic=typeof r.snapshot==='string'?JSON.parse(r.snapshot)?.topic?.id:r.snapshot?.topic?.id;
    if(legacy.has(r.question_id)&&!obsolete.has(topic)||!legacy.has(r.question_id)&&obsolete.has(topic))fail('Shared pilot/obsolete revision topic: '+r.id);
  }
  for(const a of current.practice_attempts)if(legacy.has(a.question_id)&&!obsolete.has(a.topic_id)||!legacy.has(a.question_id)&&obsolete.has(a.topic_id))fail('Shared pilot/obsolete attempt topic: '+a.id);
  for(const d of current.practice_deliveries){const r=current.question_revisions.find(r=>r.id===d.revision_id);if(!r||r.question_id!==d.question_id)fail('Invalid delivery ownership: '+d.id);}
  for(const a of current.practice_attempts){
    if(a.revision_id){const r=current.question_revisions.find(r=>r.id===a.revision_id),d=current.practice_deliveries.find(d=>d.id===a.delivery_id);if(!r||!d||r.question_id!==a.question_id||d.question_id!==a.question_id||d.user_id!==a.user_id||d.revision_id!==r.id)fail('Invalid attempt ownership: '+a.id);}
  }return counts;
}
