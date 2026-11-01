import sharp from "sharp";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";
import { db as defaultDb } from "@workspace/db";
import { inspectImage, type LessonMediaStore, mediaLimit } from "./lesson-media";
import { configuredMediaStore } from "./lesson-media-storage";
import { LessonError } from "./lessons";
export const mediaEdit = z.object({
  name:z.string().max(255).default("image"),caption:z.string().max(1000).default(""),
  rotate:z.union([z.literal(0),z.literal(90),z.literal(180),z.literal(270)]).default(0),
  ratio:z.enum(["original","1:1","4:3","16:9"]).default("original"),
  crop:z.object({left:z.number().int().nonnegative(),top:z.number().int().nonnegative(),width:z.number().int().positive(),height:z.number().int().positive()}).strict().optional(),
  keepOriginal:z.boolean().default(false),
}).strict();
let processing = 0;
export async function optimizeLessonImage(bytes:Buffer,mime:string,edit:z.infer<typeof mediaEdit>) {
  inspectImage(bytes,mime);
  if(processing>=2) throw new LessonError(429,"MEDIA_BUSY","Image processing is busy. Retry after the current uploads finish.");
  processing++;
  try {
    const base=sharp(bytes,{limitInputPixels:32000000,limitInputChannels:4,failOn:"warning",animated:false}).timeout({seconds:15}).autoOrient();
    const meta=await base.metadata();
    if(!["png","jpeg","webp"].includes(meta.format??"") || (meta.pages??1)>1) throw new LessonError(400,"MEDIA_TYPE","Use a single-frame PNG, JPEG or WebP.");
    const original=await base.resize({width:4096,height:4096,fit:"inside",withoutEnlargement:true}).webp({quality:92}).toBuffer();
    const rotated=await sharp(original,{limitInputPixels:32000000}).rotate(edit.rotate).toBuffer({resolveWithObject:true});
    let image=sharp(rotated.data,{limitInputPixels:32000000});
    if(edit.crop) image=image.extract(edit.crop);
    const ratio=edit.ratio==="original"?null:edit.ratio.split(":").map(Number);
    // A cover target larger than the source is ignored by withoutEnlargement.
    // Choose an inscribed target first so small images still get the exact ratio.
    const ratioWidth=ratio?Math.max(1,Math.floor(Math.min(1600,edit.crop?.width??rotated.info.width,(edit.crop?.height??rotated.info.height)*ratio[0]/ratio[1]))):0;
    image=ratio ? image.resize({width:ratioWidth,height:Math.max(1,Math.round(ratioWidth*ratio[1]/ratio[0])),fit:"cover",withoutEnlargement:true}) : image.resize({width:2000,height:2000,fit:"inside",withoutEnlargement:true});
    const result=await image.webp({quality:84}).toBuffer({resolveWithObject:true});
    const thumb=await sharp(result.data).resize({width:320,height:240,fit:"inside",withoutEnlargement:true}).webp({quality:70}).toBuffer();
    if([result.data,thumb,...(edit.keepOriginal?[original]:[])].some(data=>data.length>mediaLimit)) throw new LessonError(400,"MEDIA_SIZE","Optimized image still exceeds the storage limit.");
    return {image:result.data,thumb,original:edit.keepOriginal?original:null,width:result.info.width,height:result.info.height};
  } catch(error) {
    if(error instanceof LessonError) throw error;
    throw new LessonError(400,"MEDIA_DECODE","Image could not be safely decoded or the crop is outside its dimensions.");
  } finally { processing--; }
}
export async function mediaLibraryReady(db:Pick<typeof defaultDb,"execute">) {
  const result=await db.execute(sql`SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema='public' AND table_name='lesson_media' AND column_name IN ('original_name','caption','width','height','thumbnail_key','thumbnail_sha256','original_key','edit')`);
  if(Number(result.rows[0]?.count)!==8) throw new LessonError(503,"MEDIA_LIBRARY_NOT_READY","Media Library metadata requires separately approved migration 0015. No upload has been saved.");
}
export async function createLibraryMedia(actor:string,bytes:Buffer,mime:string,input:unknown,db=defaultDb,store?:LessonMediaStore) {
  const edit=mediaEdit.parse(input);
  await mediaLibraryReady(db);
  const storage=store??configuredMediaStore();
  const optimized=await optimizeLessonImage(bytes,mime,edit), id=randomUUID(), key=`${id}.webp`, thumbnail=`thumbs/${id}.webp`, original=`originals/${id}.webp`;
  await storage.put(key,optimized.image); await storage.put(thumbnail,optimized.thumb);
  if(optimized.original) await storage.put(original,optimized.original);
  // Never delete uncertain orphans after a database failure/unknown commit.
  const name=edit.name.replace(/[\u0000-\u001f\u007f/\\]/g,"_");
  await db.execute(sql`INSERT INTO public.lesson_media(id,created_by,storage_key,mime,bytes,sha256,original_name,caption,width,height,thumbnail_key,thumbnail_sha256,original_key,edit) VALUES(${id}::uuid,${actor}::uuid,${key},'image/webp',${optimized.image.length},${createHash('sha256').update(optimized.image).digest('hex')},${name},${edit.caption},${optimized.width},${optimized.height},${thumbnail},${createHash('sha256').update(optimized.thumb).digest('hex')},${optimized.original?original:null},${JSON.stringify(edit)}::jsonb)`);
  return {id,url:`/api/lesson-media/${id}`,mime:"image/webp",bytes:optimized.image.length,width:optimized.width,height:optimized.height,name,caption:edit.caption,thumbnailUrl:`/api/lesson-media/${id}?variant=thumbnail`};
}
export async function deriveLibraryMedia(actor:string,id:string,input:unknown,db=defaultDb,store?:LessonMediaStore) {
  z.string().uuid().parse(id); await mediaLibraryReady(db);
  const row=(await db.execute(sql`SELECT original_key,storage_key,mime FROM public.lesson_media WHERE id=${id}::uuid AND created_by=${actor}::uuid`)).rows[0];
  if(!row) throw new LessonError(404,"MEDIA_NOT_FOUND","Only your uploaded originals can be edited. Shared published references are unchanged.");
  const storage=store??configuredMediaStore();
  return createLibraryMedia(actor,await storage.get(String(row.original_key??row.storage_key)),"image/webp",input,db,storage);
}
export async function listLibraryMedia(input:unknown,db=defaultDb) {
  const query=z.object({q:z.string().trim().max(200).default(""),page:z.coerce.number().int().min(1).max(100000).default(1)}).strict().parse(input);
  await mediaLibraryReady(db);
  const where=query.q?sql`WHERE strpos(lower(concat_ws(' ',original_name,caption)),lower(${query.q}))>0`:sql``;
  const total=Number((await db.execute(sql`SELECT count(*)::int AS total FROM public.lesson_media ${where}`)).rows[0].total);
  const rows=(await db.execute(sql`SELECT id,original_name AS name,caption,width,height,bytes,created_at AS "createdAt" FROM public.lesson_media ${where} ORDER BY created_at DESC,id LIMIT 24 OFFSET ${(query.page-1)*24}`)).rows;
  return {items:rows.map(row=>({...row,url:`/api/lesson-media/${row.id}`,thumbnailUrl:`/api/lesson-media/${row.id}?variant=thumbnail`})),page:query.page,pageSize:24,total};
}
