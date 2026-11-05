import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@workspace/db', () => ({pool: {query: vi.fn(() => {throw new Error('Real DB forbidden in offline tests');})}}));
import { createGlobalRbacService } from './global-rbac';
import { globalRoles, permits, mayAssign, roleChangeInput, validateRoleChange } from './global-rbac-policy';
const actor='00000000-0000-4000-8000-000000000001',target='00000000-0000-4000-8000-000000000002';
const input={scope:'GLOBAL',targetId:target,role:'STUDENT',expectedVersion:0,requestId:'00000000-0000-4000-8000-000000000003',reason:'Reviewed assignment'};
describe('GLOBAL permission map',()=>{
  it.each(globalRoles)('%s never authorizes COURSE', role=>{
    expect(permits(role,'roles.manage','COURSE')).toBe(false);
    expect(roleChangeInput.safeParse({...input,scope:'COURSE',courseId:target}).success).toBe(false);
  });
  it('denies unknown and legacy roles for new authority without an explicit assignment',()=>{
    for(const role of ['USER','__proto__','owner',null,undefined])expect(permits(role,'users.read')).toBe(false);
    expect(permits('STUDENT','roles.manage')).toBe(false);expect(permits('CONTENT_MANAGER','audit.read')).toBe(false);
    expect(permits('OWNER','audit.read')).toBe(true);expect(permits('ADMIN','users.read')).toBe(true);
  });
  it('enforces the ADMIN delegation ceiling for both the existing and requested role',()=>{
    for(const role of ['OWNER','ADMIN'] as const){
      expect(mayAssign('ADMIN',role,'STUDENT')).toBe(false);expect(mayAssign('ADMIN','STUDENT',role)).toBe(false);
    }
    expect(mayAssign('ADMIN','CONTENT_MANAGER',null)).toBe(true);expect(mayAssign('STUDENT','STUDENT',null)).toBe(false);
    expect(mayAssign('OWNER','ADMIN','OWNER')).toBe(true);
  });
  it('rejects self changes, actor injection, arbitrary course IDs, invalid versions and short reasons',()=>{
    expect(()=>validateRoleChange(target,'OWNER','STUDENT',input)).toThrow(/Self/);
    for(const patch of [{actorId:actor},{courseId:target},{expectedVersion:-1},{reason:'x'},{scope:'COURSE'}])
      expect(roleChangeInput.safeParse({...input,...patch}).success).toBe(false);
  });
});
describe('service isolation and fail-closed behavior',()=>{
  it('does not query any database while activation is disabled',async()=>{
    const read=vi.fn(),change=vi.fn(),service=createGlobalRbacService(read,change,()=>false);
    await expect(service.me(actor)).rejects.toMatchObject({code:'RBAC_NOT_READY'});
    await expect(service.change(actor,input)).rejects.toMatchObject({code:'RBAC_NOT_READY'});
    expect(read).not.toHaveBeenCalled();expect(change).not.toHaveBeenCalled();
  });
  it('does not infer authorization from a missing or malformed DB context',async()=>{
    for(const value of [{role:null,scope:'GLOBAL'},{role:'OWNER',scope:'COURSE'},null]){
      const read=vi.fn().mockResolvedValue({rows:[{value}]}),change=vi.fn();
      const service=createGlobalRbacService(read,change,()=>true);
      await expect(service.list(actor,'users',{})).rejects.toBeDefined();expect(change).not.toHaveBeenCalled();
    }
  });
  it('bounds read pages and sends actor-derived parameterized queries only',async()=>{
    const read=vi.fn().mockResolvedValueOnce({rows:[{value:{role:'ADMIN',scope:'GLOBAL'}}]})
      .mockResolvedValueOnce({rows:[{value:{items:[],total:0}}]});
    const service=createGlobalRbacService(read,vi.fn(),()=>true);
    expect(await service.list(actor,'audit',{page:2})).toEqual({items:[],total:0});
    expect(read.mock.calls[1][1]).toEqual([actor,'audit',2]);
    for(const page of [0,10001])await expect(createGlobalRbacService(vi.fn().mockResolvedValue({rows:[{value:{role:'OWNER',scope:'GLOBAL'}}]}),vi.fn(),()=>true).list(actor,'users',{page})).rejects.toMatchObject({code:'RBAC_VALIDATION'});
  });
  it('uses only the separate mutation channel and preserves exact retry identity/version',async()=>{
    const read=vi.fn().mockResolvedValue({rows:[{value:{role:'OWNER',scope:'GLOBAL'}}]}),change=vi.fn().mockResolvedValue({rows:[{value:{eventId:input.requestId}}]});
    const service=createGlobalRbacService(read,change,()=>true);
    await service.change(actor,input);await service.change(actor,input);
    expect(change).toHaveBeenCalledTimes(2);expect(change.mock.calls[0]).toEqual(change.mock.calls[1]);
    expect(change.mock.calls[0][1]).toEqual([actor,target,'STUDENT',0,input.requestId,input.reason]);
    expect(read.mock.calls.every(([text])=>!text.includes('global_rbac_change'))).toBe(true);
  });
  it('does not claim success or automatically retry a rejected/uncertain mutation',async()=>{
    const read=vi.fn().mockResolvedValue({rows:[{value:{role:'OWNER',scope:'GLOBAL'}}]}),change=vi.fn().mockRejectedValue({code:'40001'});
    await expect(createGlobalRbacService(read,change,()=>true).change(actor,input)).rejects.toMatchObject({code:'40001'});
    expect(change).toHaveBeenCalledTimes(1);
  });
});
describe('proposed SQL safety structure (not a PostgreSQL execution proof)',()=>{
  const source=readFileSync(new URL('../../../../lib/db/drizzle/proposed/0018_global_rbac.sql',import.meta.url),'utf8');
  const change=source.split('CREATE FUNCTION public.global_rbac_change')[1].split('--> statement-breakpoint')[0];
  it('requires one write-serialized authority guard before user locks, authorization, version check and audit',()=>{
    const guard=change.indexOf('UPDATE public.global_rbac_guard'),users=change.indexOf('FOR SHARE'),version=change.indexOf('coalesce(old.version,0)<>expected_version'),audit=change.indexOf('INSERT INTO public.admin_audit_events');
    expect(guard).toBeGreaterThan(0);expect(users).toBeGreaterThan(guard);expect(version).toBeGreaterThan(users);expect(audit).toBeGreaterThan(version);
    expect(change).toContain('global_rbac_last_owner');expect(change).toContain('actor=target');
    expect(change).toContain('prior.request_hash<>digest');expect(change).toContain('RETURN prior.result');
    expect(change).not.toMatch(/EXCEPTION\s+WHEN|\bCOMMIT\b|\bROLLBACK\b/); // Audit failure must abort the statement/transaction.
  });
  it('withholds direct DML and app EXECUTE on management/bootstrap, and protects audit/status paths',()=>{
    expect(source).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)\b/i);
    expect(source).toContain('TO ccna_rbac_manager');
    expect(source).not.toMatch(/GRANT EXECUTE ON FUNCTION public.global_rbac_(?:change|bootstrap)[^;]+TO ccna_phase6a_app/);
    expect(source).toContain('BEFORE UPDATE OR DELETE ON public.admin_audit_events');expect(source).toContain('BEFORE TRUNCATE ON public.admin_audit_events');
    expect(source).toContain('BEFORE UPDATE OF status ON public.users');expect(source).toContain("confirmation IS DISTINCT FROM 'BOOTSTRAP GLOBAL OWNER '");
    expect(source).not.toMatch(/ALTER\s+(?:TYPE|POLICY)|DISABLE TRIGGER|BYPASSRLS\s*;|UPDATE public\.(?:questions|lessons|exam_sessions)|DELETE FROM/);
  });
});
