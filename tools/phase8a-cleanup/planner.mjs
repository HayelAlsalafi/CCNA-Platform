import { assertQuestion } from '../../docs/content/ccna-200-301/manual-admin-workflow.browser.mjs';
const confirmedNames = new Set(['local interface demo', 'disposable revision test', 'disposable live race demo']);
const fail = message => { const error=Error(message);error.cleanupDiagnostic=true;throw error; };
export function preservationSet(expected, questions) {
  if (expected.length !== 60) fail('Reviewed pack must contain exactly 60 items.');
  const preserved = expected.map(item => {
    const matches = questions.filter(q => q.referenceNotes === item.referenceNotes);
    if (matches.length !== 1) fail('Pilot provenance missing or duplicated: ' + item.pilotId);
    try { assertQuestion(matches[0], item); } catch { fail('Pilot content differs from original reviewed item: '+item.pilotId); }
    return matches[0];
  });
  if (new Set(preserved.map(q => q.id)).size !== 60) fail('Pilot identifiers are not unique.');
  return preserved;
}
export function cleanupPlan(preserved, questions, topics, dependencies) {
  const keep = new Set(preserved.map(q => q.id)), requiredTopics = new Set(preserved.map(q => q.topicId));
  const legacyTopics = topics.filter(t => !requiredTopics.has(t.id) && confirmedNames.has(t.name.trim().toLowerCase()));
  const legacyIds = new Set(legacyTopics.map(t => t.id));
  const legacyQuestions = questions.filter(q => !keep.has(q.id) && legacyIds.has(q.topicId));
  const removable = [], protectedQuestions = [];
  for (const q of legacyQuestions) {
    const refs = dependencies.questions[q.id];
    if (!refs) fail('Dependency evidence missing for question ' + q.id);
    if (refs.revisions || refs.deliveries || refs.attempts) protectedQuestions.push({ id:q.id, topicId:q.topicId, ...refs });
    else removable.push(q.id);
  }
  const removing = new Set(removable), removableTopics = [], protectedTopics = [];
  for (const t of legacyTopics) {
    const refs = dependencies.topics[t.id];
    if (!refs) fail('Dependency evidence missing for topic ' + t.id);
    if (questions.some(q => q.topicId === t.id && !removing.has(q.id)) || refs.attempts || refs.snapshots)
      protectedTopics.push({ id:t.id, name:t.name, ...refs });
    else removableTopics.push(t.id);
  }
  // The approved final scope keeps only topics required by the pilot. Empty,
  // unreferenced extras are unnecessary; question-bearing unknowns stay unresolved.
  const unnecessaryEmptyTopics=topics.filter(t=>{
    if(requiredTopics.has(t.id)||legacyIds.has(t.id)||questions.some(q=>q.topicId===t.id))return false;
    const refs=dependencies.topics[t.id];
    if(!refs)fail('Dependency evidence missing for topic '+t.id);
    return refs.attempts===0&&refs.snapshots===0;
  });
  removableTopics.push(...unnecessaryEmptyTopics.map(t=>t.id));
  const unnecessaryIds=new Set(unnecessaryEmptyTopics.map(t=>t.id));
  return {
    preservedIds: [...keep], requiredTopicIds: [...requiredTopics],
    deleteQuestionIds: removable, deleteTopicIds: removableTopics,
    disableQuestionIds: protectedQuestions.map(q => q.id), disableTopicIds: protectedTopics.map(t => t.id),
    protectedQuestions, protectedTopics,
    unnecessaryEmptyTopics: unnecessaryEmptyTopics.map(t=>({id:t.id,name:t.name,slug:t.slug})),
    unresolvedQuestions: questions.filter(q => !keep.has(q.id) && !legacyIds.has(q.topicId)).map(q => ({id:q.id,topicId:q.topicId})),
    unresolvedTopics: topics.filter(t => !requiredTopics.has(t.id) && !legacyIds.has(t.id) && !unnecessaryIds.has(t.id)).map(t => ({id:t.id,name:t.name,slug:t.slug})),
  };
}
