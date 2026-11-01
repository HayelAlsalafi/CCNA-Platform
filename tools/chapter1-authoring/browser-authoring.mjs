// Operator-run utility in the existing signed-in Admin tab. Existing APIs only.
// Tokens remain in the Clerk SDK/request headers and are never logged/downloaded.
const origins = new Set(['http://localhost:8080','http://127.0.0.1:8080']);
const protectedTitle = '1.0 Network Fundamentals';
function ensure(condition,message) { if(!condition) throw Error(message); }
function activeSession() {
  ensure(origins.has(location.origin),'Use the existing local application on port 8080.');
  ensure(location.pathname==='/admin/lessons','Open /admin/lessons first.');
  ensure(window.Clerk?.loaded && window.Clerk.session,'A real signed-in Clerk session is required.');
  return window.Clerk.session;
}
function transport() {
  const initial=activeSession().id;
  return async (url,options={})=>{
    const session=activeSession();ensure(session.id===initial,'Admin session changed; stop.');
    let token;
    try { token=await session.getToken(); } catch { throw Error('Clerk token refresh failed; stop without exposing credentials.'); }
    ensure(token,'No authenticated session token; stop.');
    ensure(url.startsWith('/api/'),'Only existing local application APIs are supported.');
    let response;
    try { response=await fetch(url,{...options,cache:'no-store',credentials:'omit',headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),'X-Admin-Session':initial,Authorization:'Bearer '+token}}); }
    catch { throw Error('Network outcome unknown; stop. Do not retry automatically. Inspect the downloaded receipt and server list before resuming.'); }
    const value=await response.json().catch(()=>null);
    if(!response.ok) {
      const code=value?.error?.code;
      throw Error(`API ${response.status}: ${typeof code==='string'&&/^[A-Z_]+$/.test(code)?code:'REQUEST_FAILED'}. Stop; no automatic retry.`);
    }
    ensure(activeSession().id===initial,'Admin session changed; stop.');
    return value;
  };
}
export function canonical(value) {
  if(Array.isArray(value))return value.map(canonical);
  if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
export async function fingerprint(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(value)))))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function download(name,value) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}
async function inspect(api) {
  const user=await api('/api/auth/me');ensure(user?.user?.role==='ADMIN','Server did not confirm ADMIN authorization.');
  const curriculum=await api('/api/curriculum');
  const matches=curriculum.domains.flatMap(domain=>domain.sections.flatMap(section=>section.chapters
    .filter(chapter=>domain.id==='d1'&&domain.number==='01'&&domain.title==='Network Fundamentals'
      &&section.id==='d1-V1'&&chapter.id==='9d8bd104-2bc5-59c8-a417-367996c7d8b9'
      &&chapter.title==='Introduction to TCP/IP Networking'
      &&chapter.description==='V1 / Chapter 1 / CCNA-V1-01')
    .map(chapter=>({domain:{id:domain.id,number:domain.number,title:domain.title},section:{id:section.id,title:section.title},chapter}))));
  ensure(matches.length===1,'Exact existing Chapter 1 could not be uniquely identified; stop.');
  const context=matches[0];
  const list=await api('/api/admin/lessons?chapterId='+encodeURIComponent(context.chapter.id));
  const originals=list.items.filter(x=>x.title===protectedTitle);
  ensure(originals.length===1,'Expected exactly one protected 1.0 lesson; stop.');
  const detail=(await api('/api/admin/lessons/'+originals[0].id)).lesson;
  ensure(detail.chapterId===context.chapter.id&&detail.status==='PUBLISHED','Protected lesson must already be published in this chapter; stop.');
  const revisions=await api('/api/admin/lessons/'+detail.id+'/revisions');
  ensure(revisions.items.length<100,'Revision endpoint is capped; full preservation evidence unavailable.');
  const published=await api('/api/lessons/'+detail.id);
  const ordered=[...list.items].filter(x=>x.status==='PUBLISHED').sort((a,b)=>a.displayOrder-b.displayOrder||a.id.localeCompare(b.id));
  ensure(ordered[0]?.id===detail.id,'Protected 1.0 lesson is not first; stop instead of reordering it.');
  return {context,existingLessons:list.items,protectedLesson:detail,protectedRevisions:revisions.items,protectedPublished:published,
    protectedFingerprint:await fingerprint({lesson:detail,revisions:revisions.items}),
    chapterContextFingerprint:await fingerprint(context)};
}
export async function inspectChapter() {
  const baseline=await inspect(transport());
  const filename='ccna-chapter1-baseline-'+new Date().toISOString().replaceAll(':','-')+'.json';
  download(filename,{operation:'READ_ONLY_CHAPTER_INSPECTION',...baseline});
  const result={stage:'inspection-complete',databaseWrites:0,chapter:baseline.context,protectedLesson:{id:baseline.protectedLesson.id,title:baseline.protectedLesson.title,status:baseline.protectedLesson.status,displayOrder:baseline.protectedLesson.displayOrder},existingLessons:baseline.existingLessons.map(x=>({id:x.id,title:x.title,status:x.status,displayOrder:x.displayOrder})),download:filename};
  console.log(JSON.stringify(result));return result;
}

const frozenPackHash='4656963410d06cf07f26842b55b236c5828ab9f087428f312a97ad46af6c254b';
const payloadFields=['chapterId','title','description','objectives','estimatedMinutes','displayOrder','blocks'];
export function lessonPayload(value) {return Object.fromEntries(payloadFields.map(k=>[k,value[k]]));}
export async function assertProtectedSnapshot(baseline,pack) {
  ensure(baseline.protectedLesson.id===pack.protectedLessonId,'Protected lesson identity changed.');
  ensure(baseline.protectedFingerprint===pack.protectedFingerprint,'Protected lesson or revision changed. Stop; no writes are permitted.');
  ensure(baseline.chapterContextFingerprint===pack.chapterContextFingerprint,'Chapter/domain/volume relationship changed.');
  ensure(await fingerprint(baseline.protectedPublished.lesson)===pack.protectedPublishedFingerprint,'Protected published lesson snapshot changed.');
}
async function executePack() {
  const api=transport(),report={operation:'CREATE_AND_PUBLISH_NEW_CHAPTER1_ONLY',stage:'pack-validation',actions:[],lessons:[],automaticRetries:0,protectedLessonWrites:0,studyEndpointCalls:0};
  let writePending=false;
  try {
    const url=new URL('../../docs/content/ccna-200-301/chapter-1/chapter-1-content-pack.json',import.meta.url);
    const response=await fetch(url,{cache:'no-store',credentials:'omit'});ensure(response.ok,'Frozen content pack unavailable.');
    const pack=await response.json();ensure(await fingerprint(pack)===frozenPackHash,'Content pack changed; stop for content validation.');
    ensure(pack.packId==='ocg-v1-ch1-continuation-20261029-v1'&&pack.lessons.length===6,'Unexpected content scope.');
    report.packId=pack.packId;report.packHash=frozenPackHash;
    report.stage='protected-baseline';
    const before=await inspect(api);await assertProtectedSnapshot(before,pack);
    const allowedExisting=new Set(pack.baselineExistingLessons.map(x=>x.id));
    const titles=new Set(pack.lessons.map(x=>x.payload.title));
    const owned=new Set();
    for(const existing of before.existingLessons)ensure(allowedExisting.has(existing.id)||titles.has(existing.title),'Unexpected existing Chapter 1 lesson; stop for inventory review.');
    const verifyProtected=async()=>{
      const detail=(await api('/api/admin/lessons/'+pack.protectedLessonId)).lesson;
      const revisions=(await api('/api/admin/lessons/'+pack.protectedLessonId+'/revisions')).items;
      ensure(await fingerprint({lesson:detail,revisions})===pack.protectedFingerprint,'Protected lesson or revisions changed; stop immediately.');
    };
    const exact=async(actual,payload)=>ensure(await fingerprint(lessonPayload(actual))===await fingerprint(payload),'Existing or saved lesson content differs from validated pack; no edit/replacement is allowed.');
    // Deliberately exposes only two POST operations. No PUT/PATCH/DELETE/reorder.
    const post=async(url,body)=>{
      ensure(url==='/api/admin/lessons'||[...owned].some(id=>id!==pack.protectedLessonId&&url==='/api/admin/lessons/'+id+'/publish'),'Write target is not a verified new-pack lesson.');
      writePending=true;
      const result=await api(url,{method:'POST',body:JSON.stringify(body)});
      writePending=false;return result;
    };
    // All six drafts must validate before any publication begins.
    for(const entry of pack.lessons) {
      const payload=entry.payload;
      ensure(payload.chapterId===pack.chapter.chapter.id&&payload.displayOrder>before.protectedLesson.displayOrder&&payload.title!==protectedTitle,'New lesson is outside the approved continuation scope.');
      await verifyProtected();report.stage='draft:'+payload.title;
      const current=(await api('/api/admin/lessons?chapterId='+encodeURIComponent(payload.chapterId))).items;
      const matches=current.filter(x=>x.title===payload.title);ensure(matches.length<=1,'Duplicate lesson title already exists; stop instead of creating another.');
      let detail;
      if(matches.length) {
        ensure(!allowedExisting.has(matches[0].id),'Refusing to reuse or mutate an original existing lesson.');
        detail=(await api('/api/admin/lessons/'+matches[0].id)).lesson;
        await exact(detail,payload);
        report.actions.push({type:'REUSE_EXACT_PACK_RECORD',id:detail.id,title:detail.title});
      } else {
        const action={type:'CREATE_DRAFT',title:payload.title,confirmed:false};report.actions.push(action);
        detail=(await post('/api/admin/lessons',payload)).lesson;
        ensure(detail&&detail.id!==pack.protectedLessonId&&!allowedExisting.has(detail.id),'Create returned an unsafe existing identifier.');
        action.id=detail.id;action.confirmed=true;
        ensure(detail.status==='DRAFT','New record was not created as an unpublished draft.');
        await exact(detail,payload);
      }
      owned.add(detail.id);
      report.lessons.push({id:detail.id,title:detail.title,status:detail.status,version:detail.version,displayOrder:detail.displayOrder,estimatedMinutes:detail.estimatedMinutes});
    }
    for(const record of report.lessons) {
      await verifyProtected();report.stage='publish:'+record.title;
      let detail=(await api('/api/admin/lessons/'+record.id)).lesson;
      const payload=pack.lessons.find(x=>x.payload.title===record.title).payload;await exact(detail,payload);
      if(detail.status==='DRAFT') {
        const action={type:'PUBLISH_NEW_REVISION',id:record.id,title:record.title,confirmed:false};report.actions.push(action);
        detail=(await post('/api/admin/lessons/'+record.id+'/publish',{version:detail.version})).lesson;
        action.confirmed=true;
      }
      ensure(detail.status==='PUBLISHED'&&detail.publishedRevisionId,'New lesson publication was not confirmed.');
      const published=await api('/api/lessons/'+record.id);await exact(published.lesson,payload);
      Object.assign(record,{status:detail.status,version:detail.version,publishedRevisionId:detail.publishedRevisionId,publicationVerified:true});
    }
    report.stage='final-preservation-and-reader-navigation';
    const after=await inspect(api);await assertProtectedSnapshot(after,pack);
    ensure(after.existingLessons.length===pack.baselineExistingLessons.length+6,'Unexpected final chapter lesson inventory.');
    const ordered=[pack.protectedLessonId,...report.lessons.map(x=>x.id)];
    const publishedList=await api('/api/chapters/'+pack.chapter.chapter.id+'/lessons');
    ensure(JSON.stringify(publishedList.items.map(x=>x.id))===JSON.stringify(ordered),'Student chapter discovery order does not match the intended sequence.');
    report.readerNavigation=[];
    for(let index=0;index<ordered.length;index++) {
      const response=await api('/api/lessons/'+ordered[index]);
      ensure((response.previous?.id??null)===(ordered[index-1]??null)&&(response.next?.id??null)===(ordered[index+1]??null),'Student Previous/Next links do not match the chapter sequence.');
      ensure(response.lesson.chapter.id===pack.chapter.chapter.id,'Student lesson changed chapter relationship.');
      report.readerNavigation.push({id:ordered[index],title:response.lesson.title,previous:response.previous?.id??null,next:response.next?.id??null,verified:true});
    }
    report.protectedLesson={id:pack.protectedLessonId,fingerprint:after.protectedFingerprint,version:after.protectedLesson.version,status:after.protectedLesson.status,displayOrder:after.protectedLesson.displayOrder,estimatedMinutes:after.protectedLesson.estimatedMinutes,revisionCount:after.protectedRevisions.length,unchanged:true};
    report.chapterContextUnchanged=true;report.newPublished=6;report.newDrafts=0;report.tables=21;report.imagePlaceholders=15;
    report.newReadingMinutes=report.lessons.reduce((n,x)=>n+x.estimatedMinutes,0);
    report.totalChapterReadingMinutes=report.newReadingMinutes+after.protectedLesson.estimatedMinutes;
    report.renderedBrowserVerification=false;report.authenticatedApiVerification=true;
    report.stage='complete';console.log(JSON.stringify(report));return report;
  } catch(error) {
    report.failure={stage:report.stage,message:error instanceof Error?error.message:'Stopped; no automatic retry.',lastWriteOutcomeUnknown:writePending};
    report.stage='STOPPED';console.log(JSON.stringify(report));throw Error('Chapter import stopped. Preserve the downloaded receipt; do not retry automatically.');
  } finally {
    download('ccna-chapter1-import-'+new Date().toISOString().replaceAll(':','-')+'.json',report);
  }
}
export async function publishChapter1() {
  ensure(navigator.locks,'A cross-tab operator lock is required for this import.');
  return navigator.locks.request('ccna-chapter1-'+frozenPackHash,{ifAvailable:true},async lock=>{
    ensure(lock,'This Chapter 1 import is already running in another tab.');
    return executePack();
  });
}
