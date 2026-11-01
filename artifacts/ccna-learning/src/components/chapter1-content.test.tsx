// Content-only validation; real API publication is verified separately.
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { lessonInputSchema } from '../../../api-server/src/lib/lesson-validation';
import { LessonContent } from './lesson-content';
import type { LessonBlock } from '@workspace/api-client-react';
const pack=JSON.parse(readFileSync(new URL('../../../../docs/content/ccna-200-301/chapter-1/chapter-1-content-pack.json',import.meta.url),'utf8'));
it('all six complete payloads pass the actual API validation with the protected chapter binding',()=>{
  expect(pack.lessons).toHaveLength(6);
  for(const entry of pack.lessons){
    const parsed=lessonInputSchema.parse(entry.payload);
    expect(parsed.chapterId).toBe('9d8bd104-2bc5-59c8-a417-367996c7d8b9');
    expect(parsed.title).not.toBe('1.0 Network Fundamentals');
    expect(parsed.displayOrder).toBeGreaterThan(0);
    expect(parsed.estimatedMinutes).toBeGreaterThanOrEqual(8);
    expect(parsed.estimatedMinutes).toBeLessThanOrEqual(12);
  }
});
it('all sections have stable unique IDs, supported native types and no image assets',()=>{
  const blocks=pack.lessons.flatMap((x:{payload:{blocks:LessonBlock[]}})=>x.payload.blocks);
  expect(new Set(blocks.map((x:LessonBlock)=>x.id)).size).toBe(blocks.length);
  expect(blocks.some((x:LessonBlock)=>['image','diagram'].includes(x.type))).toBe(false);
  expect(pack.images.map((x:{figure:string})=>x.figure).sort()).toEqual(Array.from({length:15},(_,i)=>'1-'+(i+1)).sort());
});
it('the actual student renderer renders all native tables and figure placeholders without img elements',()=>{
  let renderedTables=0,placeholderCount=0;
  for(const {payload} of pack.lessons){
    const html=renderToStaticMarkup(<LessonContent blocks={payload.blocks}/>);
    renderedTables+=(html.match(/<table(?:\s|>)/g)||[]).length;
    placeholderCount+=(html.match(/\[IMAGE PLACEHOLDER\]/g)||[]).length;
    expect(html).not.toContain('<img');
    expect(html).not.toContain('undefined');
    expect(html).toContain('<h2');
  }
  expect(renderedTables).toBe(21);
  expect(placeholderCount).toBe(15);
});
it('preserves both procedures and the complete final glossary/review tables',()=>{
  const blockText=JSON.stringify(pack.lessons);
  for(const value of ['1.1.1.1','2.2.2.2','3.3.3.3','home.htm','RFC 1122','1974','L2PDU','L3PDU','L7PDU','POP3','SMTP','PPP'])expect(blockText).toContain(value);
  const ordered=pack.lessons.flatMap((x:{payload:{blocks:any[]}})=>x.payload.blocks).filter((x:any)=>x.type==='list'&&x.ordered);
  expect(ordered.some((x:any)=>x.items.length===4&&x.items[0].startsWith('Encapsulate at Larry'))).toBe(true);
  expect(ordered.some((x:any)=>x.items.length===5&&x.items[0].startsWith('Application:'))).toBe(true);
  const glossary=pack.lessons.at(-1).payload.blocks.find((x:any)=>x.type==='table'&&x.headers[0]==='Source key term');
  expect(glossary.rows).toHaveLength(9);
});
