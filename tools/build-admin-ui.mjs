import {portableRoot,workspaceRoot} from "./workspace-root.mjs";
// Production compilation only: installed packages, no env-file loading or servers.
import { readdirSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { Module } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
const root = process.cwd();
if (root.replaceAll("\\", "/").toLowerCase() !== portableRoot.toLowerCase())
  throw Error("Wrong workspace.");
for (const name of Object.keys(process.env))
  if (/DATABASE|CLERK|NEON|^PG|^REPL|^VITE_|NODE_OPTIONS|DOTENV/i.test(name))
    delete process.env[name];
process.env.NODE_ENV = "production";
const nativeRoot = path.join(root, ".local/native-deps/node_modules");
process.env.NODE_PATH = [nativeRoot, ...readdirSync(path.join(nativeRoot, ".pnpm"))
  .map(folder => path.join(nativeRoot, ".pnpm", folder, "node_modules"))
  .filter(folder => existsSync(folder))].join(path.delimiter);
process.env.ESBUILD_BINARY_PATH = path.join(
  root,
  ".local/native-deps/node_modules/.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe",
);
Module._initPaths();
const packages = new Map();
for (const folder of readdirSync("node_modules/.pnpm")) {
  const dir = path.join(root, "node_modules/.pnpm", folder, "node_modules");
  if (!existsSync(dir)) continue;
  for (const name of ["vite", "@vitejs/plugin-react", "@tailwindcss/vite"])
    if (!packages.has(name) && existsSync(path.join(dir, name, "package.json")))
      packages.set(name, path.join(dir, name));
}
async function module(name) {
  const folder = packages.get(name);
  if (!folder) throw Error("Installed build dependency missing: " + name);
  const pkg = JSON.parse(readFileSync(path.join(folder, "package.json"), "utf8"));
  const exports = pkg.exports?.["."] ?? pkg.exports;
  const entry =
    typeof exports === "string"
      ? exports
      : (exports?.import?.default ?? exports?.import ?? exports?.default ?? pkg.module ?? pkg.main);
  return import(pathToFileURL(path.join(folder, entry)).href);
}
const { build } = await module("vite"),
  { default: react } = await module("@vitejs/plugin-react"),
  { default: tailwind } = await module("@tailwindcss/vite");
const { default: offline } = await import("./admin-unit.config.mjs");
// Unit fixtures prefer Node package exports; production must resolve jsPDF's browser build.
const browserAliases = offline.resolve.alias.map(entry => {
  if (entry.find instanceof RegExp && entry.find.test("jspdf"))
    return { ...entry, replacement: entry.replacement.replace("jspdf.node.min.js", "jspdf.es.min.js") };
  return entry;
});
const outDir = path.join(root, ".local/admin-ui-production-build", String(Date.now()));
mkdirSync(outDir, { recursive: true });
await build({
  configFile: false,
  envDir: false,
  root: path.join(root, "artifacts/ccna-learning"),
  base: "/",
  mode: "production",
  // An intentionally UNSET runtime reference keeps authenticated routes in
  // compilation without inventing a Clerk key, loading secrets or bypassing
  // authentication. This artifact is compile-only and remains fail-closed.
  define: {
    "import.meta.env.VITE_CLERK_PUBLISHABLE_KEY": "globalThis.__CCNA_OFFLINE_BUILD_CLERK_KEY__",
  },
  plugins: [react(), tailwind()],
  resolve: { alias: browserAliases, dedupe: ["react", "react-dom"] },
  build: { outDir, emptyOutDir: false },
  logLevel: "info",
});
const assets = path.join(outDir, "assets");
const code = readdirSync(assets)
  .filter((name) => name.endsWith(".js"))
  .map((name) => readFileSync(path.join(assets, name), "utf8"))
  .join("\n");
for (const marker of ["Question Bank", "Book chapters", "book-chapter-table", "Understanding Ansible, Puppet, and Chef", "/api/admin/questions/studio", "/api/admin/topics/manage", "Dashboard sections", "NETWORK CHALLENGE ARENA", "LEARNING INTELLIGENCE CENTER", "/api/nexus/", "YOUR LEARNING IDENTITY", "Yearly learning activity", "Your CCNA Skill Matrix"]) {
  if (!code.includes(marker))
    throw Error("Production compilation omitted a required application route: " + marker);
}
console.log(
  JSON.stringify({
    status: "PASS",
    productionBuild: outDir,
    environmentFilesLoaded: false,
    serversStarted: false,
    databaseConnections: 0,
    authenticatedAdminRoutesCompiled: true,
    credentialsConfigured: false,
  }),
);
