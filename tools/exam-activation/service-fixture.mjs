// Only called by the private restored rehearsal, after independently verified identity.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
export function loadExamServices(root,folder,req) {
  const shim=path.join(folder,'db-shim.mjs'),output=path.join(folder,'exam-services.cjs');
  writeFileSync(shim,'export const db=undefined;\nexport * from '+JSON.stringify(path.join(root,'lib/db/src/schema/index.ts').replaceAll('\\','/'))+';\n',{flag:'wx'});
  process.env.ESBUILD_BINARY_PATH=path.join(root,'.local/native-deps/node_modules/.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe');
  const built=req(path.join(root,'node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/lib/main.js')).buildSync({entryPoints:[path.join(root,'artifacts/api-server/src/lib/exams.ts')],bundle:true,platform:'node',format:'cjs',outfile:output,alias:{'@workspace/db':shim},metafile:true,logLevel:'silent'});
  assert(!Object.keys(built.metafile.inputs).some(p=>p.replaceAll('\\','/').endsWith('/lib/db/src/index.ts')),'Application pool import forbidden');
  return req(output);
}
