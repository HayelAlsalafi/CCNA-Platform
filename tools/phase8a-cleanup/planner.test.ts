import { expect,it } from 'vitest';
import { readPack } from '../../docs/content/ccna-200-301/prepare-pack.mjs';
import { expectedQuestions } from '../../docs/content/ccna-200-301/manual-admin-workflow.browser.mjs';
import { preservationSet, cleanupPlan } from './planner.mjs';
const p=readPack();
const bindings={topicIds:Object.fromEntries(p.topics.map((t:any,i:number)=>[t.slug,'pilot-topic-'+i]))};
const expected=expectedQuestions({...p,topicMeta:p.topics,blueprint:{sourceUrl:p.sourceUrl}},bindings);
const pilot=expected.map((q:any,i:number)=>({...q,id:'pilot-'+i,status:'ACTIVE'}));
it('preserves precisely the original 60 distinct records including answers and explanations',()=>{
 expect(preservationSet(expected,pilot).map((q:any)=>q.id)).toEqual(pilot.map((q:any)=>q.id));
 const changed=structuredClone(pilot);changed[0].options[0].isCorrect=!changed[0].options[0].isCorrect;
 expect(()=>preservationSet(expected,changed)).toThrow();
});
it('refuses missing or duplicated provenance instead of choosing a matching name',()=>{
 expect(()=>preservationSet(expected,pilot.slice(1))).toThrow(/provenance/);
 expect(()=>preservationSet(expected,[...pilot,pilot[0]])).toThrow(/duplicated/);
});
it('only deletes confidently identified dependency-free legacy content; unknown records stay',()=>{
 const old={id:'old',topicId:'old-topic'},unknown={id:'unknown',topicId:'unknown-topic'};
 const topics=[{id:'old-topic',name:'Local interface demo'},{id:'unknown-topic',name:'A legitimate topic',slug:'legitimate'}];
 const plan=cleanupPlan(pilot,[...pilot,old,unknown],topics,{questions:{old:{revisions:0,deliveries:0,attempts:0}},topics:{'old-topic':{attempts:0,snapshots:0}}});
 expect(plan.deleteQuestionIds).toEqual(['old']);expect(plan.deleteTopicIds).toEqual(['old-topic']);
 expect(plan.unresolvedQuestions).toEqual([unknown]);expect(plan.unresolvedTopics).toHaveLength(1);
});
it('retains history-protected questions/topics and only disables confirmed obsolete content',()=>{
 const old={id:'old',topicId:'old-topic'};
 const plan=cleanupPlan(pilot,[...pilot,old],[{id:'old-topic',name:'Disposable revision test'}],{questions:{old:{revisions:1,deliveries:0,attempts:0}},topics:{'old-topic':{attempts:0,snapshots:1}}});
 expect(plan.deleteQuestionIds).toEqual([]);expect(plan.deleteTopicIds).toEqual([]);
 expect(plan.disableQuestionIds).toEqual(['old']);expect(plan.disableTopicIds).toEqual(['old-topic']);
 expect(plan.preservedIds).toHaveLength(60);
});
it('never targets a topic required by a preserved question, even if its name resembles a fixture',()=>{
 const topicId=pilot[0].topicId;
 const plan=cleanupPlan(pilot,pilot,[{id:topicId,name:'Disposable live race demo'}],{questions:{},topics:{}});
 expect(plan.deleteTopicIds).toEqual([]);expect(plan.disableTopicIds).toEqual([]);
});
it('fails closed on missing dependency evidence',()=>{
 expect(()=>cleanupPlan(pilot,[...pilot,{id:'old',topicId:'t'}],[{id:'t',name:'Local interface demo'}],{questions:{},topics:{}})).toThrow(/Dependency evidence/);
});
it('removes unnecessary empty topics only when neither questions nor history reference them',()=>{
 const topics=[{id:'empty',name:'Old unused topic',slug:'unused'},{id:'historical',name:'Historical topic',slug:'historical'}];
 const plan=cleanupPlan(pilot,pilot,topics,{questions:{},topics:{empty:{attempts:0,snapshots:0},historical:{attempts:0,snapshots:1}}});
 expect(plan.deleteTopicIds).toEqual(['empty']);expect(plan.unresolvedTopics.map((t:any)=>t.id)).toEqual(['historical']);
 expect(plan.unnecessaryEmptyTopics).toHaveLength(1);
});
