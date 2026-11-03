import {it,expect,vi} from "vitest";
import {PgDialect} from "drizzle-orm/pg-core";
vi.mock("@workspace/db",async()=>({...await import("@workspace/db/schema"),db:undefined}));
import {examSession,examSubmit,examSave} from "./exams";
const id="11111111-1111-4111-8111-111111111111",user="22222222-2222-4222-8222-222222222222";
function fixture(){
 const session:any={id,status:"ACTIVE",question_count:1,started_at:"2026-01-01T00:00:00Z",deadline_at:"2026-01-01T00:05:00Z",config:{questionCount:1,durationMinutes:5},result:null};
 const item:any={delivery_id:id,question_id:id,revision_id:id,position:0,selected_keys:["A"],flagged:true,answer_version:2,
 snapshot:{questionCode:"fixture",topic:{id:user,name:"Networking",slug:"networking"},text:"Protocol?",type:"MULTIPLE_CHOICE_SINGLE",difficulty:"EASY",explanation:"Private answer",options:[{optionKey:"A",text:"TCP",isCorrect:true},{optionKey:"B",text:"UDP",isCorrect:false}]},mapping_snapshot:{domain:{id:user,name:"Network fundamentals"},chapter:{id,name:"Networking"}}};
 let now="2026-01-01T00:02:00Z";const writes:{sql:string;params:unknown[]}[]=[];
 const execute=vi.fn(async(statement:any)=>{const q=new PgDialect().sqlToQuery(statement),s=q.sql;
  if(s.includes("AS ready"))return {rows:[{ready:true}]};
  if(s.includes("FROM public.exam_sessions")){
   if(s.includes("AND user_id=")&&q.params[1]!==user)return {rows:[]};
   return {rows:[{...session,server_now:now,expired:now>=session.deadline_at}]};
  }
  if(s.includes("FROM public.exam_session_items"))return {rows:[structuredClone(item)]};
  if(s.startsWith("UPDATE")){writes.push(q);if(s.includes("UPDATE public.exam_sessions")){session.status=q.params[0];session.finalized_at=q.params[1];session.result=JSON.parse(String(q.params[2]));}}
  return {rows:[]};
 });
 const db:any={execute,transaction:async(fn:any)=>fn({execute})};
 return {db,writes,session,item,clock:(value:string)=>{now=value;}};
}
it("reload retains the captured questions, answers, flags and original deadline as server time advances",async()=>{
 const f=fixture(),a=await examSession(id,user,f.db);f.clock("2026-01-01T00:04:00Z");const b=await examSession(id,user,f.db);
 expect(a.questions).toEqual(b.questions);expect(b.questions[0]).toMatchObject({selectedOptionKeys:["A"],flagged:true,answerVersion:2});
 expect(b.deadlineAt).toBe("2026-01-01T00:05:00Z");expect(b.serverNow).not.toBe(a.serverNow);expect(b.result).toBeNull();expect(f.writes).toEqual([]);
});
it("expired server clock requires finalization, rejects saves, caps final time and preserves repeat submission",async()=>{
 const f=fixture();f.clock("2026-01-01T00:08:00Z");expect((await examSession(id,user,f.db)).needsFinalization).toBe(true);
 await expect(examSave(id,id,{selectedOptionKeys:["B"],flagged:false,expectedVersion:2},user,f.db)).rejects.toMatchObject({code:"EXAM_CLOSED"});expect(f.writes).toEqual([]);
 const result=await examSubmit(id,user,f.db);expect(result.status).toBe("EXPIRED");expect(result.finalizedAt).toBe(f.session.deadline_at);expect(result.result).toMatchObject({correct:1,completionSeconds:300});
 const count=f.writes.length;f.clock("2026-01-01T01:00:00Z");const repeat=await examSubmit(id,user,f.db);expect(repeat.result).toEqual(result.result);expect(f.writes).toHaveLength(count);
});
it("every owned operation rejects a different learner before writes",async()=>{
 const f=fixture();for(const action of [()=>examSession(id,id,f.db),()=>examSubmit(id,id,f.db),()=>examSave(id,id,{selectedOptionKeys:[],flagged:false,expectedVersion:2},id,f.db)])await expect(action()).rejects.toMatchObject({status:404});
 expect(f.writes).toEqual([]);
});
