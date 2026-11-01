import {expect,it,vi} from 'vitest';
import {topicDependencies,topicDependencySql} from './topic-dependencies.mjs';
it('binds the original UUID and returns all attempt/snapshot dependencies without interpolation',async()=>{
 const id='11111111-1111-4111-8111-111111111111';
 const query=vi.fn(async()=>({rows:[{attempts:3,snapshots:2}]}));
 expect(await topicDependencies({query},id)).toEqual({attempts:3,snapshots:2});
 const request=query.mock.calls[0][0] as any;
 expect(request.values).toEqual([id]);expect(request.text).not.toContain(id);
 expect(request.name).toBe('ccna-cleanup-topic-dependencies-v1');
});
it('statically prevents the observed text = uuid operator error; both predicates have UUID operands',()=>{
 expect(topicDependencySql).toContain('topic_id=$1::uuid');
 expect(topicDependencySql).toContain("(snapshot->'topic'->>'id')::uuid=$1::uuid");
 expect(topicDependencySql).not.toContain("snapshot->'topic'->>'id'=$1)");
});
