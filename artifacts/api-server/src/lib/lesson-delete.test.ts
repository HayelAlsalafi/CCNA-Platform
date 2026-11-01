import {it,expect,vi} from 'vitest';
import {PgDialect} from 'drizzle-orm/pg-core';
vi.mock('@workspace/db',()=>({db:undefined}));
import {deleteDraftLesson} from './lesson-delete';
import {requireAdmin} from '../middlewares/auth';
const id='11111111-1111-4111-8111-111111111111',input={version:2,confirmationTitle:'Draft fixture'};
function database(result:unknown={id,deleted:true},error?:unknown,ready=true){
 const statements:string[]=[],events:string[]=[];
 const tx={execute:vi.fn(async s=>{const q=new PgDialect().sqlToQuery(s);statements.push(q.sql);if(q.sql.includes('to_regprocedure'))return{rows:[{ready}]};if(q.sql.includes('AS result')){if(error)throw error;return{rows:[{result}]};}return{rows:[]};})};
 return {statements,events,transaction:vi.fn(async work=>{events.push('BEGIN');try{const r=await work(tx);events.push('COMMIT');return r;}catch(e){events.push('ROLLBACK');throw e;}})};
}
it('calls only the controlled function in a bounded transaction; no direct lesson/media DELETE',async()=>{
 const db=database();expect(await deleteDraftLesson(id,input,id,db as never)).toEqual({id,deleted:true});expect(db.events).toEqual(['BEGIN','COMMIT']);expect(db.statements.join(' ')).toContain('delete_never_published_lesson');expect(db.statements.some(s=>/^DELETE|^GRANT|^ALTER/.test(s))).toBe(false);
});
it('fails closed before invoking the function when activation is absent',async()=>{
 const db=database(undefined,undefined,false);await expect(deleteDraftLesson(id,input,id,db as never)).rejects.toMatchObject({status:503,code:'LESSON_DELETE_NOT_READY'});expect(db.events.at(-1)).toBe('ROLLBACK');expect(db.statements.some(s=>s.includes('AS result'))).toBe(false);
});
it('rolls back on malformed responses and maps protected categories and concurrent changes',async()=>{
 const invalid=database({id:'22222222-2222-4222-8222-222222222222',deleted:true});await expect(deleteDraftLesson(id,input,id,invalid as never)).rejects.toThrow();expect(invalid.events.at(-1)).toBe('ROLLBACK');
 for(const constraint of ['published','progress','annotations','revisions','content_reference','unknown_dependency']){const db=database(undefined,{code:'23514',constraint:'lesson_delete_'+constraint});await expect(deleteDraftLesson(id,input,id,db as never)).rejects.toMatchObject({status:409,code:'LESSON_DELETE_BLOCKED'});expect(db.events.at(-1)).toBe('ROLLBACK');}
 for(const [code,status] of [['40001',409],['55P03',409],['23503',409],['42501',403],['P0002',404],['22023',400]])await expect(deleteDraftLesson(id,input,id,database(undefined,{code}) as never)).rejects.toMatchObject({status});
});
it('rejects invalid confirmation/version before opening a transaction',async()=>{
 const db=database();await expect(deleteDraftLesson(id,{...input,version:0},id,db as never)).rejects.toThrow();expect(db.transaction).not.toHaveBeenCalled();
});
it('retains actual Admin-only authorization middleware for missing/user/admin identities',()=>{
 for(const [user,status] of [[undefined,401],[{role:'USER'},403],[{role:'ADMIN'},undefined]] as const){const response={status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();requireAdmin({dbUser:user} as never,response as never,next);if(status)expect(response.status).toHaveBeenCalledWith(status);else expect(next).toHaveBeenCalledTimes(1);}
});
