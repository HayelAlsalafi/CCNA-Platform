// Read-only source coverage report. Never loads app code, environment files,
// evidence, database clients or translation services.
import ts from 'typescript';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
const root='artifacts/ccna-learning/src';
const registered=new Set(),templateShapes=new Set();
for(const name of ['messages.ts','dynamic-messages.ts','validation-messages.ts']){
 const sf=ts.createSourceFile(name,readFileSync(path.join(root,'i18n',name),'utf8'),99,true);
 function visit(n){if(ts.isPropertyAssignment(n)&&ts.isStringLiteral(n.name)){registered.add(n.name.text);templateShapes.add(n.name.text.replace(/\{\w+\}/g,'{}'));}ts.forEachChild(n,visit);}visit(sf);
}
const technical=new Set(['CCNA','NEXUS','CCNA NEXUS','CCNA 200-301','CCNA 200-301 ·','CCNA 200-301 / NEXUS','Cisco CLI','UTC','IP','KiB','lazy','VITE_CLERK_PUBLISHABLE_KEY','CLERK_PUBLISHABLE_KEY','CLERK_SECRET_KEY','docs/development/clerk-setup.md','https://example.com/image.png']);
const findings=[];let translated=0;
function scan(file){
 const source=readFileSync(file,'utf8'),sf=ts.createSourceFile(file,source,99,true,4);
 function record(n,text,kind){text=text.replace(/\s+/g,' ').trim();if(/[a-z]{2}/i.test(text)&&!technical.has(text))findings.push({file,line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1,kind,text});}
 function rendered(n){let p=n;while(p.parent&&(ts.isParenthesizedExpression(p.parent)||(ts.isConditionalExpression(p.parent)&&p.parent.condition!==p)||(ts.isBinaryExpression(p.parent)&&[ts.SyntaxKind.BarBarToken,ts.SyntaxKind.QuestionQuestionToken].includes(p.parent.operatorToken.kind))))p=p.parent;if(!ts.isJsxExpression(p.parent))return false;const parent=p.parent.parent;return !ts.isJsxAttribute(parent)||['title','aria-label','placeholder','label','description','eyebrow','lead'].includes(parent.name.getText(sf));}
 function visit(n){
  if(ts.isCallExpression(n)&&['translateUi','t'].includes(n.expression.getText(sf))&&ts.isStringLiteral(n.arguments[0]))translated++;
  if(ts.isJsxText(n))record(n,n.text,'static text');
  if(ts.isJsxAttribute(n)&&['title','aria-label','placeholder','label','description','eyebrow','lead'].includes(n.name.getText(sf))&&n.initializer&&ts.isStringLiteral(n.initializer))record(n,n.initializer.text,'static attribute');
  if(ts.isTemplateExpression(n)&&rendered(n)&&/[a-z]{2}/i.test(n.head.text+n.templateSpans.map(s=>s.literal.text).join('')))record(n,n.getText(sf),'dynamic template');
  if(ts.isStringLiteral(n)&&rendered(n))record(n,n.text,'conditional text');
  if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(sf)==='option'&&!n.openingElement.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(sf)==='value')&&/UiMessage|UiText|translateUi\(/.test(n.getText(sf)))record(n,'Translated option lacks an explicit value','control value');
  if(ts.isCallExpression(n)&&/^(setError|setMessage|setNotice|setToast|setLinkError)$/.test(n.expression.getText(sf))){
   function owned(x){if(ts.isStringLiteral(x)&&/[a-z]{3}/i.test(x.text)&&/\s|[.!]/.test(x.text)&&!registered.has(x.text)&&!registered.has(x.text.trim()))record(x,x.text,'owned notification');
    if(ts.isTemplateExpression(x)){const shape=x.head.text+x.templateSpans.map(s=>'{}'+s.literal.text).join('');if(!templateShapes.has(shape))record(x,x.getText(sf),'owned template');}
    if(!ts.isFunctionLike(x))ts.forEachChild(x,owned);
   }for(const a of n.arguments)owned(a);
  }
  ts.forEachChild(n,visit);
 }visit(sf);
}
function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const name=path.join(dir,e.name);if(e.isDirectory()){if(e.name!=='i18n')walk(name);}else if(name.endsWith('.tsx')&&!name.includes('.test.'))scan(name);}}
walk(root);
console.log(JSON.stringify({translatedCallSites:translated,remaining:findings.length,findings},null,2));
if(findings.length)process.exitCode=1;
