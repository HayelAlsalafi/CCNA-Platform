import express,{Router,type IRouter,type Request,type Response} from "express";
import { requireAuthenticatedUser } from "../middlewares/auth";
import { courseEnrollments,EnrollmentError } from "../lib/course-enrollments";
const router:IRouter=Router();
router.use("/enrollments",(_req,res,next)=>{res.set("Cache-Control","private, no-store");next();},requireAuthenticatedUser);
const handle=(action:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response)=>{
  try{res.json(await action(req));}
  catch(error){
    if(error instanceof EnrollmentError){res.status(error.status).json({error:{code:error.code,message:error.message}});return;}
    const code=(error as {code?:string;cause?:{code?:string}})?.code??(error as {cause?:{code?:string}})?.cause?.code;
    const status=code==="42501"?403:code==="P0002"?404:["40001","40P01","23505","23514"].includes(code??"")?409:code==="22023"?400:500;
    res.status(status).json({error:{code:status===500?"ENROLLMENT_OPERATION_FAILED":status===403?"ENROLLMENT_FORBIDDEN":status===400?"VALIDATION_ERROR":"ENROLLMENT_CONFLICT",message:"Enrollment operation could not be verified. No automatic retry."}});
  }
};
router.get("/enrollments",handle(req=>courseEnrollments.list(req.dbUser!.id,req.query)));
router.get("/enrollments/:courseId/versions/:versionId/analytics",handle(req=>courseEnrollments.analytics(req.dbUser!.id,req.params)));
router.post("/enrollments",express.json({limit:"8kb"}),(req,res,next)=>{
  if(!req.verifiedAuth || req.get("X-Enrollment-Session")!==req.verifiedAuth.sessionId){
    res.status(409).json({error:{code:"ENROLLMENT_SESSION_REQUIRED",message:"A verified session precondition is required."}});return;
  }next();
},handle(req=>courseEnrollments.change(req.dbUser!.id,req.body)));
export default router;
