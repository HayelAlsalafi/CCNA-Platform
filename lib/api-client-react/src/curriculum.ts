import { customFetch } from "./custom-fetch";
export type CurriculumTopic = {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: "ACTIVE" | "DISABLED";
  questionCount: number;
  chapterIds: string[];
};
export type CurriculumChapter = { id: string; title: string; description: string };
export type CurriculumDomain = {
  id: string;
  number: string;
  title: string;
  description: string;
  sections: { id: string; title: string; chapters: CurriculumChapter[] }[];
};
export type CurriculumSummary = {
  counts?: { availableQuestions: number; mappedQuestions: number };
  version: string;
  title: string;
  domains: CurriculumDomain[];
  topics: CurriculumTopic[];
  labs: null;
};
export type CurriculumMappingReport = {
  version: string;
  mapped: CurriculumTopic[];
  unmapped: (Omit<CurriculumTopic, "chapterIds"> & { reason: string })[];
  ambiguous: (Omit<CurriculumTopic, "chapterIds"> & { reason: string })[];
};
export function getCurriculum(signal?: AbortSignal) {
  return customFetch<CurriculumSummary>("/api/curriculum", {
    signal,
    cache: "no-store",
    credentials: "same-origin",
  });
}
