import express,{Router,type Request,type Response} from 'express';
import {requireAuthenticatedUser} from '../middlewares/auth';
import {requireAdminMutationSession} from '../middlewares/admin-mutation';
import {catalogDrafts,CatalogDraftError,catalogKinds} from '../lib/catalog-drafts';
const router=Router();
router.use('/admin/catalog',(_req,res,next)=>{res.set('Cache-Control','private, no-store');next();},requireAuthenticatedUser,requireAdminMutationSession);
const handle=(action:(actor:string,req:Request)=>Promise<unknown>)=>async(req:Request,res:Response)=>{
  if(!req.dbUser||req.dbUser.status!=='ACTIVE'||req.verifiedAuth?.userId!==req.dbUser.id||!req.verifiedAuth.sessionId){
    res.status(401).json({error:{code:'UNAUTHENTICATED',message:'Verified active identity and session required.'}});return;
  }
  if(['POST','PATCH'].includes(req.method)&&req.get('X-Admin-Session')!==req.verifiedAuth.sessionId){
    res.status(409).json({error:{code:'ADMIN_SESSION_CHANGED',message:'Reload before editing a draft.'}});return;
  }
  try{res.json(await action(req.dbUser.id,req));}
  catch(error){
    if(error instanceof CatalogDraftError){res.status(error.status).json({error:{code:error.code,message:error.message}});return;}
    const state=(error as {code?:string})?.code;
    const status=state==='42501'?403:state==='P0002'?404:['40001','40P01','55P03','23505','23514','23503'].includes(state??'')?409:['22023','22007','22008','22P02','22003'].includes(state??'')?400:503;
    res.status(status).json({error:{code:status===403?'CATALOG_DRAFT_FORBIDDEN':status===404?'NOT_FOUND':status===409?'CATALOG_DRAFT_CONFLICT':status===400?'VALIDATION_ERROR':'CATALOG_DRAFT_NOT_READY',message:'Draft operation blocked or unverified. No automatic retry.'}});
  }
};
for(const entity of catalogKinds){
  const path='/admin/catalog/'+entity;
  router.get(path,handle((actor,req)=>catalogDrafts.list(actor,entity,req.query)));
  router.post(path,express.json({limit:'16kb'}),handle((actor,req)=>catalogDrafts.change(actor,entity,null,req.body)));
  router.patch(path+'/:id',express.json({limit:'16kb'}),handle((actor,req)=>catalogDrafts.change(actor,entity,req.params.id,req.body)));
}
export default router;
