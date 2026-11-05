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
