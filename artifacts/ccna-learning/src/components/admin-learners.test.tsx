// @vitest-environment jsdom
import {act} from "react";
import {createRoot} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({request:vi.fn(),identity:{userId:"admin-fixture",sessionId:"session-fixture"}}));
vi.mock("@workspace/api-client-react",()=>({lessonRequest:mocks.request}));
vi.mock("./admin-session-boundary",()=>({useAdminSession:()=>({identity:mocks.identity})}));
import {AdminLearners} from "./admin-learners";
it("presents real response counts and pagination without inventing private lesson summaries",async()=>{
  mocks.request.mockResolvedValue({total:21,items:[{id:"learner",displayName:"Fixture learner",role:"USER",status:"ACTIVE",lastLoginAt:null,practiceAttempts:3,examSessions:2,finishedExams:1}]});
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}}),host=document.createElement("div"),root=createRoot(host);document.body.append(host);
  try{
    await act(async()=>{root.render(<QueryClientProvider client={client}><AdminLearners/></QueryClientProvider>);await new Promise(r=>setTimeout(r,35));});
    await act(async()=>{await new Promise(r=>setTimeout(r,35));});
    expect(host.textContent).toContain("Fixture learner");expect(host.textContent).toContain("Practice attempts: 3");expect(host.textContent).toContain("Lesson history remains private");
    const next=[...host.querySelectorAll("button")].find(b=>b.textContent==="Next")!;expect(next.disabled).toBe(false);
    await act(async()=>{next.click();await new Promise(r=>setTimeout(r,35));});
    expect(mocks.request).toHaveBeenCalledWith("/api/admin/learners?page=2&pageSize=20",expect.objectContaining({signal:expect.any(AbortSignal)}));
  }finally{await act(async()=>root.unmount());client.clear();host.remove();}
});
