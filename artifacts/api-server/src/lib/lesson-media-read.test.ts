import {it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
vi.mock('@workspace/db',()=>({db:undefined}));
import {readLessonMedia} from './lesson-media';
import {mediaReadFailure} from './lesson-media-errors';
import {LessonError} from './lessons';
import {lessonInputSchema} from './lesson-validation';
const id='11111111-1111-4111-8111-111111111111',bytes=Buffer.from('isolated-image-bytes');
const hash=createHash('sha256').update(bytes).digest('hex');
it('keeps the same private image reference through draft contract save/reload serialization',()=>{
  const input={chapterId:id,title:'Isolated draft',description:'',objectives:[],estimatedMinutes:1,displayOrder:0,blocks:[{id,type:'image',url:'/api/lesson-media/'+id,alt:'Test diagram',caption:'Original caption',width:'wide',alignment:'left',pixelWidth:1200,pixelHeight:800}]};
  const saved=lessonInputSchema.parse(input),reopened=lessonInputSchema.parse(JSON.parse(JSON.stringify(saved)));
  expect(reopened).toEqual(saved);expect(reopened.blocks[0]).toMatchObject({url:input.blocks[0].url,alt:'Test diagram',caption:'Original caption',pixelWidth:1200});
});
function database(found=true,thumbnail=true){let calls=0;return {execute:vi.fn(async()=>({rows:++calls===1?[{ready:true}]:calls===2?(found?[{key:id+'.webp',mime:'image/webp',sha256:hash}]:[]):thumbnail?[{key:'thumbs/'+id+'.webp',hash}]:[]}))};}
it('reads authorized display and thumbnail bytes without changing references',async()=>{
  for(const variant of ['display','thumbnail'] as const){const get=vi.fn(async()=>bytes);const result=await readLessonMedia(id,true,database() as never,variant,{get,put:vi.fn()});expect(result).toMatchObject({bytes,mime:'image/webp',sha256:hash});expect(get).toHaveBeenCalledWith((variant==='thumbnail'?'thumbs/':'')+id+'.webp');}
});
it('genuinely missing/unauthorized metadata stays 404 without reading storage',async()=>{
  const get=vi.fn();await expect(readLessonMedia(id,false,database(false) as never,'display',{get,put:vi.fn()})).rejects.toMatchObject({status:404,code:'MEDIA_NOT_FOUND'});expect(get).not.toHaveBeenCalled();
});
it('distinguishes missing objects, storage failures and metadata errors without secrets',async()=>{
  for(const [error,status,code] of [[{name:'NoSuchKey'},404,'MEDIA_NOT_FOUND'],[{name:'AccessDenied'},503,'MEDIA_STORAGE_UNAVAILABLE'],[{name:'TimeoutError'},503,'MEDIA_STORAGE_UNAVAILABLE']] as const){
    await expect(readLessonMedia(id,true,database() as never,'display',{put:vi.fn(),get:vi.fn(async()=>{throw error;})})).rejects.toMatchObject({status,code});
  }
  const safe=mediaReadFailure(Object.assign(Error('secret provider or SQL detail'),{code:'42601'}));expect(safe).toMatchObject({status:500,code:'MEDIA_READ_FAILED'});expect(safe.message).not.toContain('secret');
  const missing=new LessonError(404,'MEDIA_NOT_FOUND','Unavailable');expect(mediaReadFailure(missing)).toBe(missing);
});
it('retains integrity checks and fails closed for absent thumbnail metadata',async()=>{
  await expect(readLessonMedia(id,true,database() as never,'display',{put:vi.fn(),get:vi.fn(async()=>Buffer.from('wrong'))})).rejects.toMatchObject({status:503,code:'MEDIA_INTEGRITY'});
  await expect(readLessonMedia(id,true,database(true,false) as never,'thumbnail',{put:vi.fn(),get:vi.fn()})).rejects.toMatchObject({status:404});
});
