// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {afterEach,expect,it} from 'vitest';
const require=createRequire(import.meta.url);
const {parse}=require(require.resolve('postcss',{paths:[require.resolve('vite')]}));
afterEach(()=>{document.head.innerHTML='';document.body.innerHTML='';document.documentElement.dir='ltr';});
function styles(){
 const style=document.createElement('style');document.head.append(style);
 for(const file of ['../nexus.css','../learning-workspace.css','./rtl.css']){
  const source=parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),file),'utf8'));
  for(const rule of source.nodes.filter((n:{type:string})=>n.type==='rule'))style.sheet!.insertRule(rule.toString(),style.sheet!.cssRules.length);
 }
}
it('moves the persistent sidebar offset to the right and preserves focus expansion',()=>{
 styles();document.body.innerHTML='<div class="nexus-app"><aside class="nexus-sidebar"><button class="nexus-collapse"><svg></svg></button></aside><div class="nexus-body"><div class="lesson-workspace"><pre><code>show ip route 192.0.2.0/24</code></pre></div></div></div>';
 const app=document.querySelector('.nexus-app')!,main=document.querySelector('.nexus-body')!,sidebar=document.querySelector('.nexus-sidebar')!;
 expect(getComputedStyle(main).marginLeft).toBe('258px');
 document.documentElement.dir='rtl';expect(getComputedStyle(main).marginRight).toBe('258px');expect(getComputedStyle(main).marginLeft).toBe('0px');
 expect(getComputedStyle(sidebar).inset).toBe('0 0 0 auto');
 expect(getComputedStyle(document.querySelector('svg')!).transform).toBe('scaleX(-1)');
 app.classList.add('nexus-compact');expect(getComputedStyle(main).marginRight).toBe('85px');
 expect(getComputedStyle(document.querySelector('svg')!).transform).toBe('none');
 document.querySelector('.lesson-workspace')!.classList.add('lesson-focus-mode');expect(getComputedStyle(main).marginInline).toBe('0');
 expect(getComputedStyle(document.querySelector('code')!).direction).toBe('ltr');expect(document.querySelector('code')!.textContent).toBe('show ip route 192.0.2.0/24');
});
it('uses content-relative alignment, logical list indents and bounded question containers in both directions',()=>{
 styles();document.body.innerHTML='<article class="lesson-prose"><section class="lesson-block" dir="auto"><ol><li>Route (R1): 192.0.2.1.</li></ol></section></article><span class="question-content" dir="auto">Which route?</span>';
 for(const dir of ['ltr','rtl']){
  document.documentElement.dir=dir;
  expect(getComputedStyle(document.querySelector('.lesson-block')!).textAlign).toBe('start');
  const list=getComputedStyle(document.querySelector('ol')!);
  expect(list.paddingInlineStart).toBe('1.5em');expect(list.paddingLeft).toBe('0px');expect(list.paddingRight).toBe('0px');
  const question=getComputedStyle(document.querySelector('.question-content')!);
  expect(question.textAlign).toBe('start');expect(question.maxInlineSize).toBe('100%');expect(question.minInlineSize).toBe('0');
 }
});
