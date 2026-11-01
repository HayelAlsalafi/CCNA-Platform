import type { AdminTopic } from "./generated/api.schemas";
export type ManagedTopic = AdminTopic & {
  version: string;
  questionCount: number;
  publishedQuestionCount: number;
  chapterIds: string[];
  objectiveCodes: string[];
};
export type TopicPage = {
  items: ManagedTopic[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: { total: number; active: number; disabled: number };
};
export type TopicMetadata = {
  curriculumDomains: { id: string; title: string }[];
  chapters: { id: string; title: string; domainId: string }[];
  taxonomyDomains: { id: string; code: string; name: string; version: string }[];
};
export type TopicDependency = {
  id: string;
  name: string;
  slug: string;
  questionCount: number;
  publishedQuestionCount: number;
  attempts: number;
  revisionSnapshots: number;
  blocked: boolean;
};
export type TopicDetail = {
  topic: ManagedTopic;
  questions: {
    id: string;
    questionCode: string;
    text: string;
    difficulty: string;
    status: string;
  }[];
  questionPage: number;
  questionPages: number;
  objectives: { id: string; code: string; description: string; domain: string; version: string }[];
  objectivesTruncated: boolean;
};
