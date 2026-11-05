import { beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ routes: new Map<string, Function[]>(), middleware: [] as Function[], authenticated: true, read: vi.fn() }));
vi.mock("express", () => ({ Router: () => ({
  use: (_path: string, ...handlers: Function[]) => { fixture.middleware = handlers; },
  get: (path: string, ...handlers: Function[]) => fixture.routes.set(path, handlers),
}) }));
vi.mock("../middlewares/auth", () => ({ requireAuthenticatedUser: (_req: any, res: any, next: Function) => fixture.authenticated ? next() : res.status(401).json({error:{code:"UNAUTHENTICATED"}}) }));
vi.mock("@workspace/db", () => ({ db: { execute: () => { throw Error("Real DB forbidden"); } } }));
vi.mock("../lib/course-catalog", async original => {
  const actual = await original<typeof import("../lib/course-catalog")>();
  return { ...actual, courseCatalog: { tracks: fixture.read, courses: fixture.read, versions: fixture.read, context: fixture.read } };
});
import "./course-catalog";
import { CatalogError } from "../lib/course-catalog";
beforeEach(() => { fixture.authenticated = true; fixture.read.mockReset().mockResolvedValue({items:[]}); });
async function request(path: string, params = {}) {
  const req: any = { query:{},params }, res: any = { code:200,headers:{},status(n:number){this.code=n;return this;},set(k:string,v:string){this.headers[k]=v;return this;},json(value:unknown){this.body=value;return this;} };
  const handlers = [...fixture.middleware,...fixture.routes.get(path)!];
  async function run(i:number):Promise<void> { if(i===handlers.length)return;let next:Promise<void>|undefined;await handlers[i](req,res,()=>{next=run(i+1);});await next; }
  await run(0);return res;
}
it("authenticates all catalog routes before reads and retains no-store", async () => {
  fixture.authenticated=false;
  for(const path of fixture.routes.keys()) {
    const result=await request(path);expect(result.code).toBe(401);expect(result.headers["Cache-Control"]).toBe("private, no-store");
  }
  expect(fixture.read).not.toHaveBeenCalled();
});
it("passes explicit course and version together without client actor authority", async () => {
  const result=await request("/catalog/courses/:courseId/versions/:versionId",{courseId:"course",versionId:"version"});
  expect(result.code).toBe(200);expect(fixture.read).toHaveBeenCalledWith("course","version");
});
it("returns structured readiness/validation errors and hides unexpected driver details", async () => {
  fixture.read.mockRejectedValueOnce(new CatalogError(503,"CATALOG_NOT_READY","Not activated."));
  expect((await request("/catalog/tracks")).body.error.code).toBe("CATALOG_NOT_READY");
  fixture.read.mockRejectedValueOnce(new Error("private driver details"));
  const result=await request("/catalog/tracks");expect(result.code).toBe(500);expect(JSON.stringify(result.body)).not.toContain("private driver");
});
