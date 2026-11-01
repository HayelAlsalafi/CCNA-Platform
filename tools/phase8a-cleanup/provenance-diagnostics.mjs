// Pure diagnostic projections: no database imports, connections or writes.
import {createHash} from 'node:crypto';
import {normalizedProvenanceRow} from './final-planner.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const stringify=value=>value===undefined?'__MISSING__':JSON.stringify(value);
export function safeDifference(diff){
  const permitted=diff.field==='__record__'||['status','type','difficulty','question_code','created_at','updated_at','delivered_at','expires_at','submitted_at'].includes(diff.field)||['id','topic_id','question_id','revision_id','delivery_id','objective_id','blueprint_id'].includes(diff.field);
  // Never emit learner user_id/session_id, snapshots, grading/answers or arbitrary text.
  const value=v=>permitted?v??null:{sha256:hash(stringify(v)),bytes:Buffer.byteLength(stringify(v),'utf8'),redacted:true};
  return {table:diff.table,id:diff.id,field:diff.field,expected:value(diff.expected),actual:value(diff.actual),...(diff.normalizedExpected!==undefined?{normalizedExpected:value(diff.normalizedExpected),normalizedActual:value(diff.normalizedActual)}:{})};
}
export function pilotContentFingerprint(row){
  const keys=['topicId','text','difficulty','type','explanation','imageKey','referenceNotes'];
  const content=Object.fromEntries(keys.map(k=>[k,row[k]]));
  content.options=[...row.options].map(o=>({optionKey:o.optionKey,text:o.text,isCorrect:o.isCorrect})).sort((a,b)=>a.optionKey.localeCompare(b.optionKey));
  return hash(JSON.stringify(content));
}
export function expectedPilotEvidence(expected,preserved){
  if(expected.length!==60||preserved.length!==60)throw Error('Exactly 60 independently matched pilot questions required.');
  return expected.map((item,i)=>{
    const actual=preserved[i],expectedSha256=pilotContentFingerprint(item),actualSha256=pilotContentFingerprint(actual);
    if(actualSha256!==expectedSha256)throw Error('Pilot content fingerprint mismatch.');
    return {id:actual.id,pilotId:item.pilotId,topicId:actual.topicId,expectedSha256,actualSha256,matched:true};
  });
}
export function archivalPilotEvidence(pilotIds,current,archived){
  const tables=['questions','topics','question_options','question_objectives'];
  const questionIds=new Set(pilotIds),topics=new Set(current.questions.filter(q=>questionIds.has(q.id)).map(q=>q.topic_id));
  return Object.fromEntries(tables.map(table=>{
    const select=r=>table==='questions'?questionIds.has(r.id):table==='topics'?topics.has(r.id):questionIds.has(r.question_id);
    const fingerprint=rows=>hash(JSON.stringify(rows.filter(select).map(normalizedProvenanceRow).map(r=>JSON.stringify(r)).sort()));
    const expectedSha256=fingerprint(archived[table]),actualSha256=fingerprint(current[table]);
    return [table,{expectedSha256,actualSha256,matched:expectedSha256===actualSha256}];
  }));
}
