// Snapshot topic IDs are validated as UUIDs by question_revisions_validate.
// Compare UUID to UUID, including valid uppercase/alternative UUID spellings.
export const topicDependencySql = `SELECT
  (SELECT count(*)::int FROM public.practice_attempts WHERE topic_id=$1::uuid) AS attempts,
  (SELECT count(*)::int FROM public.question_revisions WHERE (snapshot->'topic'->>'id')::uuid=$1::uuid) AS snapshots`;
export async function topicDependencies(client, topicId) {
  const result=await client.query({name:'ccna-cleanup-topic-dependencies-v1',text:topicDependencySql,values:[topicId]});
  return result.rows[0];
}
