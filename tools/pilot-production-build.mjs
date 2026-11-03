// Compile only. Never load Vite config/env files, execute application code,
// replace running build directories, or inspect private .local dependencies.
import {createRequire} from 'node:module';
import {readFileSync,mkdtempSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const name of Object.keys(process.env))
  if(/DATABASE|CLERK|NEON|^PG|^VITE_|NODE_OPTIONS|DOTENV|LESSON_MEDIA|MEDIA_RECONCILE/i.test(name)) delete process.env[name];
process.env.NODE_ENV='production';
const api=path.join(root,'artifacts/api-server'),web=path.join(root,'artifacts/ccna-learning');
const apiRequire=createRequire(path.join(api,'package.json')),webRequire=createRequire(path.join(web,'package.json'));
const {build}=apiRequire('esbuild');
const pino=apiRequire('esbuild-plugin-pino');
globalThis.require=apiRequire;
const output=mkdtempSync(path.join(tmpdir(),'ccna-pilot-build-'));
const apiSource=readFileSync(path.join(api,'build.mjs'),'utf8');
const externalBlock=apiSource.match(/external:\s*\[([\s\S]*?)\]/)?.[1];
if(!externalBlock)throw new Error('Review changed API build configuration before compiling.');
const external=[...externalBlock.matchAll(/"([^"]+)"/g)].map(match=>match[1]);
mkdirSync(path.join(output,'api'));
await build({entryPoints:[path.join(api,'src/index.ts')],platform:'node',bundle:true,format:'esm',
  outdir:path.join(output,'api'),outExtension:{'.js':'.mjs'},external,sourcemap:'linked',
  plugins:[(pino.default??pino)({transports:['pino-pretty']})],
  banner:{js:`import {createRequire as __bannerCrReq} from 'node:module';
import __bannerPath from 'node:path';import __bannerUrl from 'node:url';
globalThis.require=__bannerCrReq(import.meta.url);globalThis.__filename=__bannerUrl.fileURLToPath(import.meta.url);globalThis.__dirname=__bannerPath.dirname(globalThis.__filename);`}});
const load=async name=>import(pathToFileURL(webRequire.resolve(name)).href);
const {build:webBuild}=await load('vite'),{default:react}=await load('@vitejs/plugin-react'),{default:tailwind}=await load('@tailwindcss/vite');
await webBuild({configFile:false,envDir:false,root:web,base:'/',mode:'production',
  plugins:[react(),tailwind()],resolve:{alias:{'@':path.join(web,'src'),'@assets':path.join(root,'attached_assets')},dedupe:['react','react-dom']},
  // Deliberately undefined at runtime: compile all auth routes without a key,
  // fake identity, environment-file access or an authentication bypass.
  define:{'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY':'globalThis.__CCNA_OFFLINE_BUILD_CLERK_KEY__'},
  build:{outDir:path.join(output,'web'),emptyOutDir:false}});
console.log(JSON.stringify({status:'PASS',output,environmentFilesLoaded:false,databaseConnections:0,applicationServersStarted:0,
  deploymentArtifact:false,note:'Production compilation only. Real deployment requires separately configured Clerk public key and API environment.'}));
