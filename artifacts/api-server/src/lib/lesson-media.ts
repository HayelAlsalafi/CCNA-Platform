import { createHash, randomUUID } from "node:crypto";
import { lstat, realpath, open, readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { db as defaultDb } from "@workspace/db";
import { sql } from "drizzle-orm";
import { LessonError } from "./lessons";
import { configuredMediaStore, assertMediaKey } from "./lesson-media-storage";
import { contentAccessRequested, createContentAccess } from "./content-access";
import type { AccessActor } from "./content-access-policy";
export const mediaLimit = 5 * 1024 * 1024;
export function inspectImage(bytes: Buffer, mime: string) {
  if (!bytes.length || bytes.length > mediaLimit)
    throw new LessonError(400, "MEDIA_SIZE", "Choose an image up to 5 MiB.");
  let width = 0,
    height = 0,
    extension = "";
  if (
    mime === "image/png" &&
    bytes.length >= 33 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.toString("ascii", 12, 16) === "IHDR"
  ) {
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
    extension = "png";
  } else if (
    mime === "image/jpeg" &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes.at(-2) === 255 &&
    bytes.at(-1) === 217
  ) {
    for (let at = 2; at + 4 < bytes.length;) {
      if (bytes[at++] !== 255) break;
      let marker = bytes[at++];
      while (marker === 255) marker = bytes[at++];
      if (marker === 0xda || marker === 0xd9) break;
      const length = bytes.readUInt16BE(at);
      if (length < 2 || at + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
        height = bytes.readUInt16BE(at + 3);
        width = bytes.readUInt16BE(at + 5);
        extension = "jpg";
        break;
      }
      at += length;
    }
  } else if (
    mime === "image/webp" &&
    bytes.length >= 30 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.readUInt32LE(4) + 8 === bytes.length &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    const kind = bytes.toString("ascii", 12, 16);
    extension = "webp";
    if (kind === "VP8X") {
      width = 1 + bytes.readUIntLE(24, 3);
      height = 1 + bytes.readUIntLE(27, 3);
    } else if (kind === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      width = bytes.readUInt16LE(26) & 0x3fff;
      height = bytes.readUInt16LE(28) & 0x3fff;
    } else if (kind === "VP8L" && bytes[20] === 0x2f) {
      const bits = bytes.readUInt32LE(21);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    }
  }
  if (
    !extension ||
    width < 1 ||
    height < 1 ||
    width > 8192 ||
    height > 8192 ||
    width * height > 32000000
  )
    throw new LessonError(
      400,
      "MEDIA_TYPE",
      "Use a valid PNG, JPEG or WebP with dimensions up to 8192 and 32 megapixels.",
    );
  return { extension, width, height, sha256: createHash("sha256").update(bytes).digest("hex") };
}
export interface LessonMediaStore {
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}
export class LocalLessonMedia implements LessonMediaStore {
  constructor(private root: string) {}
  private async location(key: string) {
    assertMediaKey(key);
    const root = path.resolve(this.root),
      stat = await lstat(root),
      canonical = await realpath(root);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      canonical.toLowerCase() !== root.toLowerCase()
    )
      throw new LessonError(
        503,
        "MEDIA_STORAGE_UNSAFE",
        "Media storage requires an approved canonical private directory.",
      );
    const target = path.join(root,key), folder=path.dirname(target);
    if(folder!==root) {
      await mkdir(folder,{recursive:true,mode:0o700});
      const directory=await lstat(folder);
      if(directory.isSymbolicLink() || (await realpath(folder)).toLowerCase()!==folder.toLowerCase()) throw new LessonError(503,"MEDIA_STORAGE_UNSAFE","Unsafe media directory.");
    }
    return target;
  }
  async put(key: string, bytes: Buffer) {
    const target = await this.location(key),
      file = await open(target, "wx", 0o600);
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
  }
  async get(key: string) {
    const target = await this.location(key),
      stat = await lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > mediaLimit)
      throw new LessonError(
        503,
        "MEDIA_STORAGE_UNSAFE",
        "Media file is not a safe bounded object.",
      );
    return readFile(target);
  }
}
async function mediaReady(db: Pick<typeof defaultDb, "execute">) {
  if (
    (await db.execute(sql`SELECT to_regclass('public.lesson_media') IS NOT NULL AS ready`)).rows[0]
      ?.ready !== true
  )
    throw new LessonError(
      503,
      "MEDIA_NOT_READY",
      "Lesson media storage is not activated. No upload was saved.",
    );
}
function storage() {
  return configuredMediaStore();
}
export async function uploadLessonMedia(
  actor: string,
  bytes: Buffer,
  mime: string,
  db = defaultDb,
) {
  const info = inspectImage(bytes, mime);
  await mediaReady(db);
  // Legacy callers use the same bounded decoder/optimizer as the library; a
  // plausible file header alone is not sufficient to accept image bytes.
  const { optimizeLessonImage, mediaEdit } = await import("./lesson-media-library");
  const optimized = await optimizeLessonImage(bytes,mime,mediaEdit.parse({}));
  bytes=optimized.image;
  mime="image/webp";
  const store = storage(),
    id = randomUUID(),
    key = id + ".webp";
  await store.put(key, bytes);
  // Retain an exclusive orphan on DB failure; never risk deleting an object after
  // an unknown commit outcome. Review cleanup against all drafts/revisions first.
  await db.execute(
    sql`INSERT INTO public.lesson_media(id,created_by,storage_key,mime,bytes,sha256) VALUES(${id}::uuid,${actor}::uuid,${key},${mime},${bytes.length},${createHash("sha256").update(bytes).digest("hex")})`,
  );
  return { id, url: "/api/lesson-media/" + id, mime, bytes: bytes.length };
}
export async function readLessonMedia(id: string, admin: boolean, db = defaultDb, variant: "display"|"thumbnail" = "display", store?:LessonMediaStore, actor?:AccessActor) {
  await mediaReady(db);
  if(contentAccessRequested()) {
    // Same check for display, thumbnails and eventual HTTP 304. No Admin bypass.
    if(!actor || actor.status!=="ACTIVE") throw new LessonError(403,"CONTENT_ACCESS_DENIED","Media access is required.");
    const refs=(await db.execute(sql`SELECT l.id,r.id AS "revisionId" FROM public.lessons l
      JOIN public.lesson_revisions r ON r.id=l.published_revision_id AND r.lesson_id=l.id
      JOIN public.curriculum_chapters c ON c.id=l.chapter_id JOIN public.topics t ON t.id=c.id
      JOIN public.exam_blueprints b ON b.id=c.blueprint_id
      WHERE t.status='ACTIVE' AND b.status='ACTIVE' AND r.snapshot->>'chapterId'=c.id::text
      AND jsonb_path_exists(r.snapshot,'$.blocks[*] ? (@.url == $url)',jsonb_build_object('url','/api/lesson-media/' || ${id}::text))
      ORDER BY l.id LIMIT 1001`)).rows;
    const canRead=createContentAccess(q=>db.execute(q),()=>true);
    let allowed=false;
    if(refs.length<=1000) for(const ref of refs) {
      if(await canRead(actor,{kind:"LESSON",id:String(ref.id)},"media.read",String(ref.revisionId))) {allowed=true;break;}
    }
    if(!allowed) throw new LessonError(403,"CONTENT_ACCESS_DENIED","Media access is required.");
    admin=false;
  }
  const row = (
    await db.execute(
      sql`SELECT m.storage_key AS key,m.mime,m.sha256 FROM public.lesson_media m WHERE m.id=${id}::uuid AND (${admin} OR EXISTS(SELECT 1 FROM public.lessons l JOIN public.lesson_revisions r ON r.id=l.published_revision_id AND r.lesson_id=l.id JOIN public.curriculum_chapters c ON c.id=l.chapter_id JOIN public.topics t ON t.id=c.id JOIN public.exam_blueprints b ON b.id=c.blueprint_id WHERE t.status='ACTIVE' AND b.status='ACTIVE' AND r.snapshot->>'chapterId'=c.id::text AND jsonb_path_exists(r.snapshot,'$.blocks[*] ? (@.url == $url)',jsonb_build_object('url','/api/lesson-media/' || ${id}::text))))`,
    )
  ).rows[0];
  if (!row) throw new LessonError(404, "MEDIA_NOT_FOUND", "Published media not available.");
  let key=String(row.key), hash=row.sha256;
  if(variant==="thumbnail") {
    const thumbnail=(await db.execute(sql`SELECT thumbnail_key AS key,thumbnail_sha256 AS hash FROM public.lesson_media WHERE id=${id}::uuid`)).rows[0];
    if(!thumbnail?.key) throw new LessonError(404,"MEDIA_NOT_FOUND","Thumbnail unavailable.");
    key=String(thumbnail.key); hash=thumbnail.hash;
  }
  let bytes:Buffer;
  try {bytes = await (store??storage()).get(key);} catch(error) {
    if(error instanceof LessonError)throw error;
    const code=(error as {name?:string;code?:string})?.name??(error as {code?:string})?.code;
    if(code==='NoSuchKey'||code==='NotFound'||(error as {code?:string})?.code==='ENOENT')throw new LessonError(404,"MEDIA_NOT_FOUND","Stored image object is unavailable. No replacement was made.");
    throw new LessonError(503,"MEDIA_STORAGE_UNAVAILABLE","Image storage could not be read. Ask an administrator to check the storage connection.");
  }
  if (createHash("sha256").update(bytes).digest("hex") !== hash)
    throw new LessonError(503, "MEDIA_INTEGRITY", "Stored media integrity check failed.");
  return { bytes, mime: variant==="thumbnail" ? "image/webp" : String(row.mime), sha256:String(hash) };
}
