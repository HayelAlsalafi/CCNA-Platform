import { z } from 'zod/v4';
import { pool } from '@workspace/db';
import { globalRbac, catalogDraftManagement } from './global-rbac';
export const catalogKinds=['tracks','courses','versions'] as const;
export type CatalogKind=typeof catalogKinds[number];
const uuid=z.string().uuid();
const metadata={title:z.string().trim().min(1).max(180),description:z.string().trim().max(4000),
  displayOrder:z.number().int().min(0).max(100000),reason:z.string().trim().min(5).max(500)};
const request={requestId:uuid};
const slug=z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(100);
const key=z.string().regex(/^[a-z0-9][a-z0-9._-]*$/).max(100);
export const draftCreateSchemas={
  tracks:z.strictObject({...metadata,...request,slug}),
  courses:z.strictObject({...metadata,...request,slug,trackId:uuid}),
  versions:z.strictObject({...metadata,...request,courseId:uuid,blueprintId:uuid,versionKey:key,catalogKey:slug.max(100)}),
};
export const draftEditSchema=z.strictObject({...metadata,...request,expectedVersion:z.string().datetime({precision:6})});
const result=z.object({id:uuid,status:z.literal('DRAFT'),version:z.string().datetime({precision:6}),title:z.string().min(1).max(180),description:z.string().max(4000),displayOrder:z.number().int().min(0).max(100000)});
export class CatalogDraftError extends Error{
  constructor(public status:number,public code:string,message:string){super(message);}
}
type Query=(text:string,values:unknown[])=>Promise<{rows:Record<string,unknown>[]} >;
export function createCatalogDraftService(read:Query,change:(values:unknown[])=>Promise<{rows:Record<string,unknown>[]}>,
  context:(actor:string)=>Promise<{scope:string;role:unknown}>,enabled:()=>boolean){
  async function authorize(actor:string){
    if(!enabled())throw new CatalogDraftError(503,'CATALOG_DRAFT_NOT_READY','Draft catalog management is not activated.');
    if(!uuid.safeParse(actor).success)throw new CatalogDraftError(401,'UNAUTHENTICATED','Verified active identity required.');
    const current=await context(actor);
    if(current.scope!=='GLOBAL'||(current.role!=='OWNER'&&current.role!=='ADMIN'))
      throw new CatalogDraftError(403,'CATALOG_DRAFT_FORBIDDEN','An explicit active GLOBAL OWNER or ADMIN assignment is required.');
  }
  function kind(value:CatalogKind){if(!catalogKinds.includes(value))throw new CatalogDraftError(400,'VALIDATION_ERROR','Unknown catalog kind.');return value;}
  return {
    async list(actor:string,entity:CatalogKind,input:unknown){
      await authorize(actor);kind(entity);
      const schema=entity==='tracks'?z.strictObject({page:z.coerce.number().int().min(1).max(10000).default(1)}):
        z.strictObject({page:z.coerce.number().int().min(1).max(10000).default(1),parentId:uuid});
      const parsed=schema.safeParse(input);
      if(!parsed.success)throw new CatalogDraftError(400,'VALIDATION_ERROR','Use bounded pagination and an exact parent identity.');
      const p=parsed.data;
      const value=(await read('SELECT public.catalog_draft_read($1::uuid,$2::text,$3::uuid,$4::integer) AS value',
        [actor,entity,'parentId' in p?p.parentId:null,p.page])).rows[0]?.value;
      const page=z.strictObject({items:z.array(result).max(20),page:z.literal(p.page),pageSize:z.literal(20),total:z.number().int().nonnegative().safe()}).safeParse(value);
      if(!page.success)throw new CatalogDraftError(503,'CATALOG_DRAFT_UNVERIFIED','Draft catalog response could not be verified.');
      return page.data;
    },
    async change(actor:string,entity:CatalogKind,target:unknown,input:unknown){
      await authorize(actor);kind(entity);
      if(target!==null&&!uuid.safeParse(target).success)throw new CatalogDraftError(400,'VALIDATION_ERROR','Valid draft identity required.');
      const parsed=(target===null?draftCreateSchemas[entity]:draftEditSchema).safeParse(input);
      if(!parsed.success)throw new CatalogDraftError(400,'VALIDATION_ERROR','Use explicit draft metadata; identity, parents and publication cannot be edited.');
      const {requestId,...fields}=parsed.data;
      const expected='expectedVersion' in fields?fields.expectedVersion:null;
      const payload=Object.fromEntries(Object.entries(fields).filter(([name])=>name!=='expectedVersion'));
      const raw=(await change([actor,entity,target,expected,requestId,JSON.stringify(payload)])).rows[0]?.value;
      const response=result.safeParse(raw);
      if(!response.success||(target!==null&&response.data.id!==target)||response.data.title!==payload.title||
        response.data.description!==payload.description||response.data.displayOrder!==payload.displayOrder||
        (typeof expected==='string'&&response.data.version<=expected))
        throw new CatalogDraftError(503,'CATALOG_DRAFT_UNVERIFIED','Draft outcome is unverified. Do not automatically retry.');
      return response.data;
    },
  };
}
export const catalogDrafts=createCatalogDraftService((text,values)=>pool.query(text,values),catalogDraftManagement,
  actor=>globalRbac.context(actor),()=>process.env.CATALOG_DRAFT_ENABLED==='true');
