import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import { installPilotSecurity, securityConfig, apiError, apiNotFound } from "./pilot-security";
const servers: ReturnType<ReturnType<typeof express>["listen"]>[] = [];
afterEach(async () => { for (const server of servers.splice(0)) await new Promise<void>(r => server.close(() => r())); });
async function fixture(env: NodeJS.ProcessEnv = {}) {
  const app = express();
  app.use("/__clerk", (_req, res) => { res.set("X-Proxy-Fixture", "untouched").send("proxy"); });
  installPilotSecurity(app, { NODE_ENV: "development", ...env });
  app.use(express.json());
  app.get("/api/healthz", (_req, res) => { res.json({status:"ok"}); });
  app.get("/api/lesson-media/:id", (_req, res) => { res.send("fixture"); });
  app.all("/api/test", (_req, res) => { res.json({ok:true}); });
  app.post(["/api/admin/test", "/api/admin/lesson-media", "/api/exams", "/api/practice/questions/id/answer", "/api/nexus/submissions", "/api/nexus/sessions/id/finish"], (_req,res) => {res.json({ok:true});});
  app.get("/api/throw", () => { throw new Error("private driver stack and credential"); });
  app.use("/api", apiNotFound); app.use(apiError);
  const server=app.listen(0,"127.0.0.1"); servers.push(server);
  await new Promise<void>(r=>server.once("listening",r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
it("requires explicit exact HTTPS production origins and validates numeric limits/proxy",()=>{
  expect(()=>securityConfig({NODE_ENV:"production"})).toThrow("ALLOWED_ORIGINS");
  for(const origin of ["*","https://example.invalid/path","https://user:pass@example.invalid","http://example.invalid"])
    expect(()=>securityConfig({NODE_ENV:"production",ALLOWED_ORIGINS:origin})).toThrow();
  expect(securityConfig({NODE_ENV:"production",ALLOWED_ORIGINS:"https://example.invalid"}).trustProxy).toBe(false);
  expect(()=>securityConfig({NODE_ENV:"development",API_TRUST_PROXY:"true"})).toThrow();
  expect(()=>securityConfig({NODE_ENV:"development",API_RATE_GLOBAL:"0"})).toThrow();
});
it("production starts only with an explicit allowlist and emits transport security headers",async()=>{
  const base=await fixture({NODE_ENV:"production",ALLOWED_ORIGINS:"https://pilot.example.invalid"});
  const allowed=await fetch(base+"/api/test",{headers:{Origin:"https://pilot.example.invalid"}});
  expect(allowed.status).toBe(200);expect(allowed.headers.get("access-control-allow-origin")).toBe("https://pilot.example.invalid");
  expect(allowed.headers.get("strict-transport-security")).toContain("max-age=");
  const local=await fetch(base+"/api/test",{headers:{Origin:"http://localhost:8080"}});expect(local.status).toBe(403);
});
it("allows configured CORS/preflight and rejects unapproved origins with a JSON error",async()=>{
  const base=await fixture();
  const allowed=await fetch(base+"/api/test",{headers:{Origin:"http://localhost:8080"}});
  expect(allowed.headers.get("access-control-allow-origin")).toBe("http://localhost:8080");
  expect(allowed.headers.get("x-content-type-options")).toBe("nosniff");
  expect((await fetch(base+"/api/test",{method:"OPTIONS",headers:{Origin:"http://localhost:8080","Access-Control-Request-Method":"POST","Access-Control-Request-Headers":"x-admin-session"}})).status).toBe(204);
  const rejected=await fetch(base+"/api/test",{headers:{Origin:"https://untrusted.invalid"}});
  expect(rejected.status).toBe(403); expect(await rejected.json()).toMatchObject({error:{code:"ORIGIN_NOT_ALLOWED"}});
});
it("limits API traffic while health/media reads and Clerk proxy remain available",async()=>{
  const base=await fixture({API_RATE_GLOBAL:"1"});
  expect((await fetch(base+"/api/test")).status).toBe(200);
  const limited=await fetch(base+"/api/test");expect(limited.status).toBe(429);
  expect(limited.headers.has("retry-after")).toBe(true);
  expect(await limited.json()).toMatchObject({error:{code:"RATE_LIMITED"}});
  for(let i=0;i<3;i++) for(const p of ["/api/healthz","/api/lesson-media/id","/__clerk"]) expect((await fetch(base+p)).status).toBe(200);
  const proxy=await fetch(base+"/__clerk");expect(proxy.headers.get("x-proxy-fixture")).toBe("untouched");expect(proxy.headers.has("x-content-type-options")).toBe(false);
});
it.each([
  ["/api/admin/test","API_RATE_ADMIN"], ["/api/admin/lesson-media","API_RATE_UPLOADS"],
  ["/api/exams","API_RATE_EXAM_START"],["/api/practice/questions/id/answer","API_RATE_PRACTICE_SUBMIT"],
  ["/api/nexus/submissions","API_RATE_PRACTICE_SUBMIT"],["/api/nexus/sessions/id/finish","API_RATE_PRACTICE_SUBMIT"]
])("applies the stricter mutation budget at %s",async(path,setting)=>{
  const base=await fixture({[setting]:"1"});
  expect((await fetch(base+path,{method:"POST"})).status).toBe(200);
  expect((await fetch(base+path,{method:"POST"})).status).toBe(429);
});
it("Express-equivalent case and trailing-slash variants share the strict exam start budget",async()=>{
  const base=await fixture({API_RATE_EXAM_START:"1"});
  expect((await fetch(base+"/api/exams",{method:"POST"})).status).toBe(200);
  expect((await fetch(base+"/API/EXAMS/",{method:"POST"})).status).toBe(429);
});
it("returns JSON for unknown API paths and hides unexpected error/stack details",async()=>{
  const base=await fixture();const missing=await fetch(base+"/api/missing");expect(missing.status).toBe(404);
  expect(await missing.json()).toMatchObject({error:{code:"NOT_FOUND"}});
  const failed=await fetch(base+"/api/throw");expect(failed.status).toBe(500);
  expect(await failed.text()).not.toMatch(/private|credential|stack/);
  const invalid=await fetch(base+"/api/test",{method:"POST",headers:{"Content-Type":"application/json"},body:"{"});
  expect(invalid.status).toBe(400);expect(await invalid.json()).toMatchObject({error:{code:"INVALID_JSON"}});
});
