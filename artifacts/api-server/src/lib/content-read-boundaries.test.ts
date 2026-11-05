import { expect,it,vi,afterEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { createHash } from "node:crypto";
vi.mock("@workspace/db",()=>({db:undefined}));
import { publishedLesson,chapterLessonList } from "./lessons";
import { readLessonMedia } from "./lesson-media";
const actor="11111111-1111-4111-8111-111111111111",lesson="22222222-2222-4222-8222-222222222222",revision="33333333-3333-4333-8333-333333333333",media="44444444-4444-4444-8444-444444444444";
const user={id:actor,status:"ACTIVE",role:"ADMIN"},bytes=Buffer.from("offline media bytes"),hash=createHash("sha256").update(bytes).digest("hex");
afterEach(()=>vi.unstubAllEnvs());
function fake(allowed=false) {
  const calls:{sql:string;params:unknown[]}[]=[],db:any={execute:vi.fn(async(statement:any)=>{
    const q=new PgDialect().sqlToQuery(statement);calls.push(q);
    if(q.sql.includes("to_regclass"))return {rows:[{ready:true}]};
    if(q.sql.includes("content_access_context"))return {rows:[{value:{actorActive:true,resource:{kind:"LESSON",id:lesson,available:true,policy:"ENTITLED",freeActions:[],previewActions:[],publishedRevisionId:revision,previewRevisionId:null},grants:allowed?[{userId:actor,resourceId:lesson,actions:["media.read"],startsAt:"2020-01-01T00:00:00Z",endsAt:null,revokedAt:null}]:[]}}]};
    if(q.sql.includes('SELECT l.id,r.id AS "revisionId"'))return {rows:[{id:lesson,revisionId:revision}]};
    if(q.sql.includes("thumbnail_key"))return {rows:[{key:"thumb.webp",hash}]};
    if(q.sql.includes("m.storage_key"))return {rows:[{key:"image.webp",mime:"image/webp",sha256:hash}]};
    return {rows:[{id:lesson,snapshot:{title:"Protected title"}}]};
  }),transaction:async(fn:any)=>fn(db)};
  return {db,calls};
}
it("denies even legacy Admin before fetching a paid published body",async()=>{
  vi.stubEnv("CONTENT_ACCESS_ENABLED","true");const f=fake();
  await expect(publishedLesson(lesson,f.db,user)).rejects.toMatchObject({status:403,code:"CONTENT_ACCESS_DENIED"});
  expect(f.calls.some(q=>q.sql.includes("r.snapshot"))).toBe(false);
});
it("filters inaccessible lesson metadata rather than disclosing titles through chapter lists",async()=>{
  vi.stubEnv("CONTENT_ACCESS_ENABLED","true");const f=fake();
  expect(await chapterLessonList(lesson,f.db,user)).toEqual({items:[]});
});
it.each(["display","thumbnail"] as const)("%s has no Admin shortcut or storage read on denial",async variant=>{
  vi.stubEnv("CONTENT_ACCESS_ENABLED","true");const f=fake(),store={get:vi.fn(),put:vi.fn()};
  await expect(readLessonMedia(media,true,f.db,variant,store,user)).rejects.toMatchObject({status:403});
  expect(store.get).not.toHaveBeenCalled();expect(f.calls.some(q=>q.sql.includes("m.storage_key"))).toBe(false);
});
it.each(["display","thumbnail"] as const)("%s accepts explicit media permission through a current published reference",async variant=>{
  vi.stubEnv("CONTENT_ACCESS_ENABLED","true");const f=fake(true),store={get:vi.fn(async()=>bytes),put:vi.fn()};
  expect(await readLessonMedia(media,true,f.db,variant,store,user)).toMatchObject({bytes,sha256:hash});
  expect(store.get).toHaveBeenCalledWith(variant==="display"?"image.webp":"thumb.webp");
  expect(f.calls.find(q=>q.sql.includes("m.storage_key"))?.params).toContain(false);
  const route=await import("node:fs");const source=route.readFileSync(new URL("../routes/lesson-media.ts",import.meta.url),"utf8");
  expect(source.indexOf("await readLessonMedia(")).toBeLessThan(source.indexOf('req.get("If-None-Match")'));
});
