import {lessonRequest} from '@workspace/api-client-react';
import {adminMutationOptions,type AdminIdentity} from './admin-session';
export const draftBase='/api/admin/catalog';
export type DraftKind='tracks'|'courses'|'versions';
export type DraftRecord={id:string;title:string;description:string;displayOrder:number;status:'DRAFT';version:string};
export type DraftPage={items:DraftRecord[];total:number;page:number;pageSize:20};
export type DraftFields={title:string;description:string;displayOrder:string;reason:string;slug:string};
export type DraftOperation=Readonly<{kind:DraftKind;targetId:string|null;parentId:string|null;expectedVersion:string|null;requestId:string;body:Readonly<Record<string,string|number>>}>;
type ErrorCategory='validation'|'forbidden'|'missing'|'conflict'|'session'|'unavailable'|'unresolved';
export class DraftClientError extends Error{constructor(public category:ErrorCategory,public status?:number,public code?:string){super(category);}}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
// Opaque UTC microseconds: never interpret, localize or round through Date.
const token=/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{6}Z$/;
const kindOk=(value:unknown):value is DraftKind=>typeof value==='string'&&['tracks','courses','versions'].includes(value);
export function parseDraft(raw:unknown):DraftRecord{
  const r=raw as Partial<DraftRecord>|null;
  if(!r||typeof r.id!=='string'||!uuid.test(r.id)||r.status!=='DRAFT'||typeof r.version!=='string'||!token.test(r.version)||
    typeof r.title!=='string'||!r.title.trim()||r.title.length>180||typeof r.description!=='string'||r.description.length>4000||
    typeof r.displayOrder!=='number'||!Number.isInteger(r.displayOrder)||r.displayOrder<0||r.displayOrder>100000)throw new DraftClientError('unavailable');
  return {id:r.id,title:r.title,description:r.description,displayOrder:r.displayOrder,status:'DRAFT',version:r.version};
}
export function classifyDraftError(error:unknown,mutation=false):DraftClientError{
  if(error instanceof DraftClientError)return mutation&&error.category==='unavailable'?new DraftClientError('unresolved'):error;
  const e=error as {status?:number;data?:{error?:{code?:unknown}}}|null;
  const status=e?.status,rawCode=e?.data?.error?.code,code=typeof rawCode==='string'&&/^[A-Z_]{1,80}$/.test(rawCode)?rawCode:undefined;
  if(status===401||code==='ADMIN_SESSION_CHANGED')return new DraftClientError('session',status,code);
  if(status===400)return new DraftClientError('validation',status,code);
  if(status===403)return new DraftClientError('forbidden',status,code);
  if(status===404)return new DraftClientError('missing',status,code);
  if(status===409)return new DraftClientError('conflict',status,code);
  return new DraftClientError(mutation?'unresolved':'unavailable',status,code);
}
export async function listDrafts(kind:DraftKind,parentId:string|null,page:number,signal?:AbortSignal):Promise<DraftPage>{
  if(!kindOk(kind)||!Number.isInteger(page)||page<1||page>10000||(kind!=='tracks'&&(!parentId||!uuid.test(parentId))))throw new DraftClientError('validation');
  const query=new URLSearchParams({page:String(page)});if(kind!=='tracks')query.set('parentId',parentId!);
  try{
    const raw=await lessonRequest<DraftPage>(`${draftBase}/${kind}?${query}`,{signal});
    if(!raw||raw.page!==page||raw.pageSize!==20||!Number.isSafeInteger(raw.total)||raw.total<0||!Array.isArray(raw.items)||raw.items.length>20)throw new DraftClientError('unavailable');
    const items=raw.items.map(parseDraft);if(new Set(items.map(r=>r.id)).size!==items.length)throw new DraftClientError('unavailable');
    return {items,total:raw.total,page,pageSize:20};
  }catch(error){throw classifyDraftError(error);}
}
export function prepareDraftOperation(kind:DraftKind,target:DraftRecord|null,parentId:string|null,fields:DraftFields,requestId:string):DraftOperation{
  if(!kindOk(kind)||!uuid.test(requestId)||(kind==='versions'&&!target))throw new DraftClientError('validation');
  const title=fields.title.trim(),description=fields.description.trim(),reason=fields.reason.trim();
  if(!title||title.length>180||description.length>4000||reason.length<5||reason.length>500||!/^\d{1,6}$/.test(fields.displayOrder)||Number(fields.displayOrder)>100000)throw new DraftClientError('validation');
  const body:Record<string,string|number>={requestId,title,description,displayOrder:Number(fields.displayOrder),reason};
  if(target){parseDraft(target);body.expectedVersion=target.version;}
  else{
    if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fields.slug)||fields.slug.length>100)throw new DraftClientError('validation');
    body.slug=fields.slug;
    if(kind==='courses'){if(!parentId||!uuid.test(parentId))throw new DraftClientError('validation');body.trackId=parentId;}
  }
  return Object.freeze({kind,targetId:target?.id??null,parentId,expectedVersion:target?.version??null,requestId,body:Object.freeze(body)});
}
export async function sendDraftOperation(operation:DraftOperation,identity:AdminIdentity):Promise<DraftRecord>{
  try{
    const response=parseDraft(await lessonRequest<unknown>(`${draftBase}/${operation.kind}${operation.targetId?'/'+operation.targetId:''}`,{
      ...adminMutationOptions('catalog-draft',identity).request,method:operation.targetId?'PATCH':'POST',body:JSON.stringify(operation.body),
    }));
    if((operation.targetId&&response.id!==operation.targetId)||response.title!==operation.body.title||response.description!==operation.body.description||response.displayOrder!==operation.body.displayOrder||
      (operation.expectedVersion&&response.version<=operation.expectedVersion))throw new DraftClientError('unresolved');
    return response;
  }catch(error){throw classifyDraftError(error,true);}
}
