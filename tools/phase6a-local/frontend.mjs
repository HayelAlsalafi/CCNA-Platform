// Installed frontend dependencies only. No credentials, env files or database access.
import {existsSync,readdirSync} from 'node:fs';
import {Module,createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {LocalRuntimeError} from './policy.mjs';

export function configureFrontendNativePaths(root) {
  const native=path.join(root,'.local/native-deps/node_modules');
  const store=path.join(native,'.pnpm');
  const paths=existsSync(native)?[native]:[];
  if(existsSync(store))for(const entry of readdirSync(store,{withFileTypes:true})) {
    const folder=path.join(store,entry.name,'node_modules');
    if(entry.isDirectory()&&existsSync(folder))paths.push(folder);
  }
  process.env.NODE_PATH=paths.join(path.delimiter);
  // NODE_PATH is read at process startup. Updating the environment alone does
  // not update CommonJS resolution used by the native dependency loaders.
  Module._initPaths();
  return paths;
}

export async function loadFrontendDependencies(root,onStage=()=>{}) {
  configureFrontendNativePaths(root);
  const require=createRequire(path.join(root,'artifacts/ccna-learning/package.json'));
  const modules=[];
  for(const [name,stage] of [['vite','frontend-import-vite'],['@vitejs/plugin-react','frontend-import-react'],['@tailwindcss/vite','frontend-import-tailwind']]) {
    onStage(stage);
    try {modules.push(await import(pathToFileURL(require.resolve(name)).href));}
    catch {
      throw new LocalRuntimeError('Installed frontend dependency could not load: '+name+'. Check the existing Windows native dependency paths; no automatic installation or fallback was attempted.');
    }
  }
  return {createServer:modules[0].createServer,react:modules[1].default,tailwindcss:modules[2].default};
}
