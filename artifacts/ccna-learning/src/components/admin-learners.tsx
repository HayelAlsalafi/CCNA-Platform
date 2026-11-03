import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { lessonRequest } from "@workspace/api-client-react";
import { useAdminSession } from "./admin-session-boundary";
import { adminQueryKey } from "../lib/admin-session";
import { AdminPanel } from "./admin-ui";
type Summary={items:{id:string;displayName:string|null;role:string;status:string;lastLoginAt:string|null;practiceAttempts:number;examSessions:number;finishedExams:number}[];total:number;lessonActivityReason:string};
export function AdminLearners(){
  const session=useAdminSession(),[page,setPage]=useState(1);
  const query=useQuery({queryKey:adminQueryKey(["/api/admin/learners",page],session.identity),
    queryFn:({signal})=>lessonRequest<Summary>(`/api/admin/learners?page=${page}&pageSize=20`,{signal}),
    retry:false,gcTime:0});
  return <AdminPanel title="Learner activity (read only)">
    <p className="admin-muted">Summary counts only. Lesson history remains private; role and status changes require separately approved permissions.</p>
    {query.isPending?<p role="status">Loading learner summaries…</p>:query.isError?<div role="alert">Summaries unavailable. <button type="button" onClick={()=>void query.refetch()}>Retry</button></div>:<>
      <p>{query.data.total} accounts</p>
      <ul style={{listStyle:"none",padding:0}}>{query.data.items.map(user=><li key={user.id} style={{paddingBlock:".75rem",borderBlockEnd:"1px solid var(--border)"}}>
        <strong>{user.displayName||"Learner"}</strong> — {user.role} / {user.status}
        <p>Last login: {user.lastLoginAt?new Date(user.lastLoginAt).toLocaleString():"Unavailable"}</p>
        <p>Practice attempts: {user.practiceAttempts} · Exam sessions: {user.examSessions} · Finalized: {user.finishedExams}</p>
      </li>)}</ul>
      {!query.data.items.length&&<p>No accounts on this page.</p>}
      <nav aria-label="Learner pages"><button type="button" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><span> Page {page} </span><button type="button" disabled={page*20>=query.data.total} onClick={()=>setPage(p=>p+1)}>Next</button></nav>
    </>}
  </AdminPanel>;
}
