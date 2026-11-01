import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { LocalLessonMedia, type LessonMediaStore, mediaLimit } from "./lesson-media";
import { LessonError } from "./lessons";
export function assertMediaKey(key: string) {
  if (!/^(?:thumbs\/|originals\/)?[a-f0-9-]{36}\.(png|jpg|webp)$/.test(key)) throw new LessonError(400,"MEDIA_KEY","Invalid media identifier.");
}
export function mediaEndpoint(value:string, environment=process.env.NODE_ENV) {
  const endpoint=new URL(value);
  const localDevelopment=environment==="development" && endpoint.origin==="http://127.0.0.1:9000" && endpoint.pathname==="/";
  if((endpoint.protocol!=="https:"&&!localDevelopment) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
    throw new LessonError(503,"MEDIA_NOT_READY","Use HTTPS storage, or the exact 127.0.0.1:9000 MinIO endpoint in development.");
  return endpoint;
}
export class S3LessonMedia implements LessonMediaStore {
  private client: S3Client;
  constructor(private bucket: string, options: NonNullable<ConstructorParameters<typeof S3Client>[0]>) { this.client = new S3Client(options); }
  async put(key: string, bytes: Buffer) {
    assertMediaKey(key);
    if (bytes.length > mediaLimit) throw new LessonError(400,"MEDIA_SIZE","Image object exceeds its limit.");
    await this.client.send(new PutObjectCommand({ Bucket:this.bucket, Key:`ccna-lessons/${key}`, Body:bytes,
      ContentType:key.endsWith(".webp")?"image/webp":key.endsWith(".png")?"image/png":"image/jpeg",
      CacheControl:"private, max-age=3600", IfNoneMatch:"*" }), {abortSignal:AbortSignal.timeout(20000)});
  }
  async get(key: string) {
    assertMediaKey(key);
    const object = await this.client.send(new GetObjectCommand({Bucket:this.bucket,Key:`ccna-lessons/${key}`}), {abortSignal:AbortSignal.timeout(20000)});
    if (!object.Body || (object.ContentLength ?? 0)>mediaLimit) throw new LessonError(503,"MEDIA_SIZE","Stored object exceeds its limit.");
    const chunks:Buffer[]=[]; let size=0;
    for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
      size+=chunk.length;
      if(size>mediaLimit) throw new LessonError(503,"MEDIA_SIZE","Stored object exceeds its limit.");
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
export function configuredMediaStore(): LessonMediaStore {
  if(process.env.LESSON_MEDIA_PROVIDER === "s3") {
    const names=["LESSON_MEDIA_S3_ENDPOINT","LESSON_MEDIA_S3_REGION","LESSON_MEDIA_S3_BUCKET","LESSON_MEDIA_S3_ACCESS_KEY_ID","LESSON_MEDIA_S3_SECRET_ACCESS_KEY"] as const;
    if(names.some(name=>!process.env[name])) throw new LessonError(503,"MEDIA_NOT_READY","S3-compatible media storage is not fully configured.");
    const endpoint=mediaEndpoint(process.env.LESSON_MEDIA_S3_ENDPOINT!);
    return new S3LessonMedia(process.env.LESSON_MEDIA_S3_BUCKET!, { endpoint:endpoint.href, region:process.env.LESSON_MEDIA_S3_REGION!,forcePathStyle:true,
      credentials:{accessKeyId:process.env.LESSON_MEDIA_S3_ACCESS_KEY_ID!,secretAccessKey:process.env.LESSON_MEDIA_S3_SECRET_ACCESS_KEY!},maxAttempts:2 });
  }
  if(process.env.LESSON_MEDIA_PROVIDER === "local-test" && process.env.NODE_ENV !== "production" && process.env.LESSON_MEDIA_ROOT) return new LocalLessonMedia(process.env.LESSON_MEDIA_ROOT);
  throw new LessonError(503,"MEDIA_NOT_READY","Persistent media storage is not configured. Local-test storage is never a production fallback.");
}
