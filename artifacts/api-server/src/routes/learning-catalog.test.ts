import express from 'express';
import type { AddressInfo } from 'node:net';
import { beforeAll,afterAll,expect,it,vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
const state=vi.hoisted(()=>({join:null as any,where:null as any}));
vi.mock('@workspace/db',async()=>{
 const schema=await import('@workspace/db/schema');
 return {...schema,db:{select:()=>{
   const c:any={}; c.from=c.groupBy=()=>c;
   c.leftJoin=(_t:any,on:any)=>{state.join=on;return c;};c.where=(on:any)=>{state.where=on;return c;};
   c.orderBy=async()=>[{topic:{id:'11111111-1111-4111-8111-111111111111',slug:'retained',name:'Retained topic',description:'Original',displayOrder:1},questionCount:3},{topic:{id:'22222222-2222-4222-8222-222222222222',slug:'empty',name:'Empty topic',description:'',displayOrder:2},questionCount:0}];
   return c;
 }}};
});
vi.mock('../lib/learning-progress',()=>({getLearningProgress:vi.fn()}));
vi.mock('../middlewares/auth',()=>({requireAuthenticatedUser:vi.fn()}));
import router from './learning';
let server:ReturnType<ReturnType<typeof express>['listen']>,base:string;
beforeAll(async()=>{const app=express();app.use((_req,res,next)=>{(_req as any).log={info:()=>{}};next();});app.use('/api',router);server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${(server.address()as AddressInfo).port}/api`;});
afterAll(()=>new Promise<void>(r=>server.close(()=>r())));
it('topic selector counts use actual aggregate results and ACTIVE filters, including empty topics',async()=>{
 const r=await fetch(base+'/topics');expect(r.status).toBe(200);const topics=await r.json();
 expect(topics.map((t:any)=>t.questionCount)).toEqual([3,0]);
 expect(new PgDialect().sqlToQuery(state.join).params).toEqual(['ACTIVE']);
 expect(new PgDialect().sqlToQuery(state.where).params).toEqual(['ACTIVE']);
});
it('public dashboard totals no longer report a hardcoded zero question bank',async()=>{
 const r=await fetch(base+'/dashboard/summary');expect(r.status).toBe(200);const data=await r.json();
 expect(data.totalQuestions).toBe(3);expect(data.totalTopics).toBe(2);
 expect(data.focusTopic.questionCount).toBe(3);
});
