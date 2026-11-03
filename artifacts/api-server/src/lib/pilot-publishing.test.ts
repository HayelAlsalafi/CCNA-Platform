import {it,expect,vi} from "vitest";
vi.mock("@workspace/db",async()=>({...await import("@workspace/db/schema"),db:undefined}));
vi.mock("./question-revisions",()=>({captureQuestionRevision:vi.fn(async()=>({id:"revision"}))}));
import {questionsTable} from "@workspace/db/schema";
import {ccnaBookChapters} from "../../../../lib/ccna-book-chapters";
import {createQuestion} from "./questions";
import {createAdminQuestion,updateAdminQuestion} from "./questions-admin";
import {examAvailability} from "./exams";
import {PgDialect} from "drizzle-orm/pg-core";
const input={topicId:ccnaBookChapters[0].topicId,text:"Which protocol provides reliable transport?",type:"MULTIPLE_CHOICE_SINGLE",difficulty:"EASY",explanation:"TCP provides reliable ordered delivery.",
  options:[{optionKey:"A",text:"TCP",isCorrect:true},{optionKey:"B",text:"UDP",isCorrect:false}]};
function fixture(){
 const writes:Record<string,unknown>[]=[];
 const tx:any={transaction:async(fn:any)=>fn(tx),select:()=>({from:()=>({where:()=>({limit:async()=>[{id:input.topicId}]})})}),
  insert:(table:unknown)=>({values:(value:any)=>({returning:async()=>{if(table===questionsTable){writes.push(value);return [{id:"question",questionCode:"fixture",createdAt:new Date("2026-01-01"),updatedAt:new Date("2026-01-01"),...value}];}return value;}})})};
 return {db:tx,writes};
}
it.each([undefined,"ACTIVE","DISABLED"])("central creation overrides requested/default status %s without changing schema",async status=>{
 const f=fixture();const result=await createQuestion({...input,...(status?{status}:{})},f.db);
 expect(f.writes).toHaveLength(1);expect(f.writes[0].status).toBe("DISABLED");expect(result.question.status).toBe("DISABLED");
});
it("legacy admin creation also remains non-live",async()=>{
 const f=fixture();const result=await createAdminQuestion({...input,status:"ACTIVE"},f.db);
 expect(result.status).toBe("DISABLED");expect(f.writes[0].status).toBe("DISABLED");
});
it("legacy enable cannot bypass Studio review or start a transaction",async()=>{
 const db={transaction:vi.fn()} as any;
 await expect(updateAdminQuestion("fixture",{status:"ACTIVE"},db)).rejects.toMatchObject({code:"VALIDATION_ERROR"});
 expect(db.transaction).not.toHaveBeenCalled();
});
it.each([0,16,25])("availability preserves the database-provided count %s rather than assuming a fixed bank",async count=>{
 const queries:string[]=[];
 const db={execute:vi.fn(async(statement:any)=>{const text=new PgDialect().sqlToQuery(statement).sql;queries.push(text);
   return {rows:text.includes("AS ready")?[{ready:true}]:[{id:input.topicId,available:count}]};})} as any;
 const result=await examAvailability({},db);expect(result.available).toBe(count);expect(result.ready).toBe(true);
 for(const required of ["q.status='ACTIVE'","t.status='ACTIVE'","curriculum_chapters","question_options"])expect(queries[0]).toContain(required);
 // Privilege checks contain literal permission names; inspect SQL keywords, not string values.
 const statements=queries.map(query=>query.replace(/'(?:''|[^'])*'/g, "''"));
 for(const statement of statements)expect(statement).toMatch(/^\s*(SELECT|WITH)\b/);
 expect(statements.join(" ")).not.toMatch(/\b(?:UPDATE|INSERT|DELETE)\b/);
});
