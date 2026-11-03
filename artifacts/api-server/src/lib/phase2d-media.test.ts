import { tmpdir } from "node:os";
import {expect,it,vi} from "vitest";
import {mkdtemp,mkdir,readFile} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {PgDialect} from "drizzle-orm/pg-core";
vi.mock("@workspace/db",()=>({db:undefined}));
import {optimizeLessonImage,mediaEdit,createLibraryMedia,listLibraryMedia,deriveLibraryMedia} from "./lesson-media-library";
import {LocalLessonMedia,readLessonMedia} from "./lesson-media";
import {assertMediaKey,configuredMediaStore} from "./lesson-media-storage";
const actor="11111111-1111-4111-8111-111111111111";
const fixture=()=>sharp({create:{width:1200,height:800,channels:4,background:{r:20,g:90,b:120,alpha:1}}}).png().toBuffer();
it("actually decodes, rotates, crops, optimizes and thumbnails bounded image fixtures",async()=>{
  const result=await optimizeLessonImage(await fixture(),"image/png",mediaEdit.parse({rotate:90,ratio:"1:1",keepOriginal:true}));
  const main=await sharp(result.image).metadata(), thumb=await sharp(result.thumb).metadata();
  expect(main.format).toBe("webp");expect(result.width).toBe(result.height);expect(thumb.width).toBeLessThanOrEqual(320);expect(thumb.height).toBeLessThanOrEqual(240);expect(result.original).toBeTruthy();expect(main.exif).toBeUndefined();
  const cropped=await optimizeLessonImage(await fixture(),"image/png",mediaEdit.parse({crop:{left:0,top:0,width:300,height:200}}));expect(cropped.width).toBe(300);expect(cropped.height).toBe(200);
});
it("rejects executable/mismatched/truncated images and out-of-bounds crops",async()=>{
  await expect(optimizeLessonImage(Buffer.from('<svg onload="bad()"/>'),"image/png",mediaEdit.parse({}))).rejects.toMatchObject({code:"MEDIA_TYPE"});
  await expect(optimizeLessonImage((await fixture()).subarray(0,40),"image/png",mediaEdit.parse({}))).rejects.toBeTruthy();
  await expect(optimizeLessonImage(await fixture(),"image/jpeg",mediaEdit.parse({}))).rejects.toMatchObject({code:"MEDIA_TYPE"});
  await expect(optimizeLessonImage(await fixture(),"image/png",mediaEdit.parse({crop:{left:9999,top:0,width:200,height:100}}))).rejects.toMatchObject({code:"MEDIA_DECODE"});
});
it("keeps uploads blocked before object writes when metadata is not activated",async()=>{
  const db={execute:vi.fn(async()=>({rows:[{count:0}]}))},store={put:vi.fn(),get:vi.fn()};
  await expect(createLibraryMedia(actor,await fixture(),"image/png",{},db as never,store)).rejects.toMatchObject({code:"MEDIA_LIBRARY_NOT_READY"});expect(store.put).not.toHaveBeenCalled();
});
it("stores and retrieves real optimized objects in a disposable local fixture, without overwriting references",async()=>{
  const base=path.join(tmpdir(), "ccna-phase2d-media-fixtures");await mkdir(base,{recursive:true});const root=await mkdtemp(path.join(base,"case-"));expect(root.startsWith(base+path.sep)).toBe(true);
  const store=new LocalLessonMedia(root);let inserted:any[]=[];const queries:string[]=[];
  const db={execute:vi.fn(async(statement:unknown)=>{const q=new PgDialect().sqlToQuery(statement as never);queries.push(q.sql);
    if(q.sql.includes("information_schema"))return{rows:[{count:8}]};
    if(q.sql.startsWith("INSERT")){inserted=q.params;return{rows:[]};}
    if(q.sql.includes("to_regclass"))return{rows:[{ready:true}]};
    return{rows:[{key:inserted[2],mime:"image/webp",sha256:inserted[4]}]};})};
  const media=await createLibraryMedia(actor,await fixture(),"image/png",{name:"test.png",caption:"Disposable figure"},db as never,store);
  const bytes=await readFile(path.join(root,`${media.id}.webp`));expect((await sharp(bytes).metadata()).format).toBe("webp");
  const rendered=await readLessonMedia(media.id,false,db as never,"display",store);expect(rendered.bytes).toEqual(bytes);
  expect(queries.at(-1)).toContain("r.id=l.published_revision_id");expect(queries.some(q=>/DELETE|UPDATE|TRUNCATE/.test(q))).toBe(false);
});
it("denies cross-owner derivation and permits only opaque object keys",async()=>{
  const db={execute:vi.fn(async(statement:unknown)=>({rows:new PgDialect().sqlToQuery(statement as never).sql.includes("information_schema")?[{count:8}]:[]}))};
  await expect(deriveLibraryMedia(actor,actor,{},db as never)).rejects.toMatchObject({code:"MEDIA_NOT_FOUND"});
  for(const key of ["../outside.png","https://bucket/file.webp","thumbs/../../x","x.svg"])expect(()=>assertMediaKey(key)).toThrow();
  expect(()=>assertMediaKey(`thumbs/${actor}.webp`)).not.toThrow();
  const old=process.env.LESSON_MEDIA_PROVIDER;delete process.env.LESSON_MEDIA_PROVIDER;expect(()=>configuredMediaStore()).toThrow();if(old)process.env.LESSON_MEDIA_PROVIDER=old;
});
it("paginates and parameterizes catalog search without fetching binary objects",async()=>{
  const statements:{sql:string;params:unknown[]}[]=[];const db={execute:vi.fn(async(statement:unknown)=>{const q=new PgDialect().sqlToQuery(statement as never);statements.push(q);return{rows:q.sql.includes("information_schema")?[{count:8}]:q.sql.includes("count(*)")?[{total:0}]:[]};})};
  const result=await listLibraryMedia({q:"' OR true --",page:2},db as never);expect(result.pageSize).toBe(24);expect(statements.at(-1)?.sql).toContain("LIMIT");expect(statements.at(-1)?.sql).not.toContain("' OR true");expect(statements.at(-1)?.params).toContain(24);
});
