import {EventEmitter} from 'node:events';
import {expect,it,vi} from 'vitest';
import {authenticationInput,diagnoseAuthentication} from './authentication.mjs';
import {policy} from '../phase6a-local/policy.mjs';
const config={host:policy.host,port:policy.port,database:policy.database,role:policy.migrationRole,systemIdentifier:policy.upgradeSystemIdentifier,password:'offline !%:/@"\\雪 test'};
it('uses the same exact local connection fields, without URL encoding or password rewriting',async()=>{
 const event=new EventEmitter();const create=vi.fn((options:any)=>({connection:event,connect:async()=>{event.emit('authenticationSASL',{mechanisms:['SCRAM-SHA-256']});throw Object.assign(Error('private raw details'),{code:'28P01'});},query:vi.fn(),end:vi.fn()}));
 const result=await diagnoseAuthentication(config,create);
 expect(create.mock.calls[0][0]).toMatchObject({host:policy.host,port:5432,database:policy.database,user:policy.migrationRole,password:config.password,ssl:false});
 expect(result).toMatchObject({authenticated:false,sqlState:'28P01',authenticationMechanism:'SCRAM-SHA-256',databaseWrites:0});
 expect(JSON.stringify(result)).not.toContain(config.password);expect(JSON.stringify(result)).not.toContain('private raw details');
 expect(create).toHaveBeenCalledTimes(1);
 expect(create.mock.results[0].value.query).not.toHaveBeenCalled();
});
it('reads identity and nonsecret role metadata only, never password catalogs or cleanup tables',async()=>{
 const query=vi.fn(async(sql:string)=>({rows:sql.includes('identity()')?[{identity:{database:policy.database,sessionRole:policy.migrationRole,host:policy.host,port:5432,versionNumber:180006,dataDirectory:policy.dataDirectory,systemIdentifier:policy.upgradeSystemIdentifier,neon:null}}]:[]}));
 const result=await diagnoseAuthentication(config,()=>({connection:new EventEmitter(),connect:async()=>{},query,end:async()=>{}}));
 expect(result.stage).toBe('complete');expect(query.mock.calls[0][0]).toBe('BEGIN READ ONLY');
 expect(query.mock.calls.map(c=>c[0]).join(' ')).not.toMatch(/pg_authid|rolpassword|DELETE|UPDATE|INSERT|ALTER|DROP/i);
});
it('rejects role/target overrides before any connection is created',async()=>{
 const create=vi.fn();await expect(diagnoseAuthentication({...config,role:'postgres'},create)).rejects.toThrow();
 await expect(diagnoseAuthentication({...config,port:55440},create)).rejects.toThrow();
 expect(create).not.toHaveBeenCalled();
 expect(authenticationInput({...config,role:policy.appRole}).role).toBe(policy.appRole);
});
