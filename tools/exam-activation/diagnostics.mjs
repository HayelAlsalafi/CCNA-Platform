// Sanitized assertion diagnostics; never logs query parameters, driver messages or rows.
import {createHash} from 'node:crypto';
export function check(name,fn) {try{return fn();}catch(e){e.ccnaCheck??=name;throw e;}}
export async function checked(name,fn) {try{return await fn();}catch(e){e.ccnaCheck??=name;throw e;}}
const hash=v=>createHash('sha256').update(String(v)).digest('hex');
function diff(a,b,path='$') {
 if(Object.is(a,b))return null;
 if(a&&b&&typeof a==='object'&&typeof b==='object') {
  for(const key of new Set([...Object.keys(a),...Object.keys(b)])){const d=diff(a[key],b[key],path+'.'+key);if(d)return d;}
 }
 return {path,expected:a,actual:b};
}
function value(v,publicMetadata) {
 if(v===null||typeof v==='boolean'||typeof v==='number'||v===undefined)return v??null;
 const text=typeof v==='string'?v:JSON.stringify(v);
 return publicMetadata&&text.length<=180?text:{sha256:hash(text),length:text.length};
}
export function sanitizedFailure(error) {
 const subcheck=error.ccnaCheck??'unclassified';const d=diff(error.expected,error.actual);
 const publicMetadata=subcheck.startsWith('metadata.');
 const location=String(error.stack??'').match(/(?:tools[\\/][^\s)]+):(\d+):(\d+)/)?.[0]?.replaceAll('\\','/');
 const firstLine=String(error.message??'').split('\n')[0];
 const reason=/^(Unexpected|Exam|Application|Missing|Unreviewed|Existing|Invalid)[A-Za-z0-9 ,._:/()-]{0,140}$/.test(firstLine)?firstLine:null;
 return {subcheck,reason,errorType:['AssertionError','Error','TypeError'].includes(error.name)?error.name:'Other',operator:typeof error.operator==='string'?error.operator:null,location:location??null,
 difference:d?{path:d.path,expected:value(d.expected,publicMetadata),actual:value(d.actual,publicMetadata)}:null};
}
