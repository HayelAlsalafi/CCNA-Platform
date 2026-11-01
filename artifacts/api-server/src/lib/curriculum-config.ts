import { ccnaBookDomains } from "../../../../lib/ccna-book-chapters";
export const curriculumVersion = "ccna-200-301-v1.1-book-48";
export const curriculumDomains = ccnaBookDomains.map((d,index)=>({
  id:`d${index+1}`, number:String(index+1).padStart(2,"0"),title:d.name,
  description:`CCNA 200-301 v1.1 / ${d.examWeight}%`,
  sections:(["V1","V2"] as const).map(volume=>({
    id:`d${index+1}-${volume}`,title:`Official Cert Guide / ${volume}`,
    chapters:d.chapters.filter(c=>c.volume===volume).map(c=>({
      id:c.topicId,title:c.title,description:`${c.volume} / Chapter ${c.chapterNumber} / ${c.code}`,
    })),
  })).filter(s=>s.chapters.length),
}));
export const topicChapterBindings: Readonly<Record<string,readonly string[]>> = Object.fromEntries(
 ccnaBookDomains.flatMap(d=>d.chapters.map(c=>[c.slug,[c.topicId]]))
);
export type CurriculumTopic = {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: "ACTIVE" | "DISABLED";
  questionCount: number;
};
export function mapCurriculumTopics(topics: CurriculumTopic[]) {
  const mapped: (CurriculumTopic & { chapterIds: string[] })[] = [],
    unmapped: (CurriculumTopic & { reason: string })[] = [],
    ambiguous: (CurriculumTopic & { reason: string })[] = [];
  const chapterIds = new Set(
    curriculumDomains.flatMap((d) => d.sections.flatMap((s) => s.chapters.map((c) => c.id))),
  );
  const ids = new Map<string, number>(),
    slugs = new Map<string, number>();
  for (const t of topics) {
    ids.set(t.id, (ids.get(t.id) ?? 0) + 1);
    slugs.set(t.slug, (slugs.get(t.slug) ?? 0) + 1);
  }
  for (const topic of topics) {
    const bindings = topicChapterBindings[topic.slug];
    if (ids.get(topic.id) !== 1 || slugs.get(topic.slug) !== 1) {
      ambiguous.push({
        ...topic,
        reason: "Duplicate stable identifier; explicit review required.",
      });
    } else if (!bindings || !bindings.includes(topic.id)) {
      unmapped.push({ ...topic, reason: "No reviewed chapter binding for this exact slug." });
    } else if (bindings.some((id) => !chapterIds.has(id))) {
      ambiguous.push({ ...topic, reason: "Unknown configured chapter; review configuration." });
    } else mapped.push({ ...topic, chapterIds: [...bindings] });
  }
  return { mapped, unmapped, ambiguous };
}
