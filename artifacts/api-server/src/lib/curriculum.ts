import { and, asc, count, eq } from "drizzle-orm";
import { db, topicsTable, questionsTable } from "@workspace/db";
import {
  curriculumDomains,
  curriculumVersion,
  mapCurriculumTopics,
  type CurriculumTopic,
} from "./curriculum-config";

/** Aggregate only IDs/metadata/counts; never fetch question bodies or answers. */
export async function curriculumTopics(includeDisabled = false, database = db): Promise<CurriculumTopic[]> {
  return database
    .select({
      id: topicsTable.id,
      slug: topicsTable.slug,
      name: topicsTable.name,
      description: topicsTable.description,
      status: topicsTable.status,
      questionCount: count(questionsTable.id),
    })
    .from(topicsTable)
    .leftJoin(
      questionsTable,
      and(
        eq(questionsTable.topicId, topicsTable.id),
        eq(questionsTable.status, "ACTIVE"),
        eq(topicsTable.status, "ACTIVE"),
      ),
    )
    .where(includeDisabled ? undefined : eq(topicsTable.status, "ACTIVE"))
    .groupBy(topicsTable.id)
    .orderBy(asc(topicsTable.displayOrder), asc(topicsTable.name));
}
export async function curriculumSummary(database = db) {
  const topics = await curriculumTopics(false,database);
  const { mapped } = mapCurriculumTopics(topics);
  return {
    version: curriculumVersion,
    title: "CCNA 200-301",
    domains: curriculumDomains,
    topics: mapped,
    labs: null,
    counts: { availableQuestions: topics.reduce((n,t)=>n+t.questionCount,0), mappedQuestions: mapped.reduce((n,t)=>n+t.questionCount,0) },
  };
}
export async function curriculumMappingReport(database = db) {
  return { version: curriculumVersion, ...mapCurriculumTopics(await curriculumTopics(true,database)) };
}
