import { z } from "zod/v4";
import { db,pool } from "@workspace/db";
import { createContentAccess } from "./content-access";
import { courseLearningAnalytics } from "./course-learning-analytics";

export const enrollmentStates=["ACTIVE","PAUSED","WITHDRAWN"] as const;
export type EnrollmentState=typeof enrollmentStates[number];
export function validEnrollmentTransition(previous:EnrollmentState|null,next:EnrollmentState) {
  return previous===null ? next==="ACTIVE" :
    previous==="ACTIVE" ? ["PAUSED","WITHDRAWN"].includes(next) :
    previous==="PAUSED" ? ["ACTIVE","WITHDRAWN"].includes(next) : next==="ACTIVE";
}
export const enrollmentChangeInput=z.strictObject({
  courseId:z.string().uuid(),versionId:z.string().uuid(),status:z.enum(enrollmentStates),
  expectedVersion:z.number().int().min(0).max(2147483646),requestId:z.string().uuid(),
});
const pageInput=z.strictObject({page:z.coerce.number().int().min(1).max(10000).default(1)});
const scopeInput=z.strictObject({courseId:z.string().uuid(),versionId:z.string().uuid()});
export class EnrollmentError extends Error {
  constructor(public status:number,public code:string,message:string){super(message);}
}
type Query=(text:string,values:unknown[])=>Promise<{rows:Record<string,unknown>[]} >;
export function createEnrollmentService(query:Query,discover:(actor:string,version:string)=>Promise<boolean>,
  analytics:(actor:string,course:string,version:string)=>Promise<unknown>,enabled:()=>boolean) {
  function ready(actor:string){
    if(!enabled())throw new EnrollmentError(503,"ENROLLMENT_NOT_READY","Enrollment is not activated.");
    if(!z.string().uuid().safeParse(actor).success)throw new EnrollmentError(401,"UNAUTHENTICATED","Verified identity required.");
  }
  return {
    async list(actor:string,input:unknown){
      ready(actor);const p=pageInput.safeParse(input);
      if(!p.success)throw new EnrollmentError(400,"VALIDATION_ERROR","Use bounded enrollment pagination.");
      return (await query("SELECT public.course_enrollment_read($1::uuid,$2::integer) AS value",[actor,p.data.page])).rows[0]?.value;
    },
    async change(actor:string,input:unknown){
      ready(actor);const p=enrollmentChangeInput.safeParse(input);
      if(!p.success)throw new EnrollmentError(400,"VALIDATION_ERROR","Invalid enrollment context or lifecycle request.");
      if(p.data.status==="ACTIVE" && !(await discover(actor,p.data.versionId)))
        throw new EnrollmentError(403,"ENROLLMENT_FORBIDDEN","Catalog discovery permission is required; enrollment does not grant access.");
      const v=p.data;
      return (await query("SELECT public.course_enrollment_change($1::uuid,$2::uuid,$3::uuid,$4::text,$5::integer,$6::uuid) AS value",
        [actor,v.courseId,v.versionId,v.status,v.expectedVersion,v.requestId])).rows[0]?.value;
    },
    async analytics(actor:string,input:unknown){
      ready(actor);const p=scopeInput.safeParse(input);
      if(!p.success)throw new EnrollmentError(400,"VALIDATION_ERROR","Exact course and version identities required.");
      return analytics(actor,p.data.courseId,p.data.versionId);
    },
  };
}
const discover=createContentAccess(q=>db.execute(q),()=>true);
export const courseEnrollments=createEnrollmentService((text,values)=>pool.query(text,values),
  (actor,id)=>discover({id:actor,status:"ACTIVE"},{kind:"VERSION",id},"metadata.read"),
  courseLearningAnalytics,()=>process.env.ENROLLMENT_ENABLED==="true");
