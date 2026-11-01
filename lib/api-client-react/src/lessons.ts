import { customFetch, type CustomFetchOptions } from "./custom-fetch";
// Types are generated from the additive OpenAPI lesson contract.
export type {
  LessonContentBlock as LessonBlock,
  LessonCreateInput as LessonInput,
  LessonSummaryRecord as LessonSummary,
  LessonAdminRecord as LessonAdmin,
  LessonPublishedRecord as LessonPublished,
  LessonRevisionRecord as LessonRevision,
} from "./lesson-api/api.schemas";
/** Existing authenticated transport; writes supply the captured Admin session. */
export function lessonRequest<T>(path: string, options: CustomFetchOptions = {}) {
  return customFetch<T>(path, { ...options, cache: "no-store", credentials: "same-origin" });
}
export type LessonLibraryItem = import("./lesson-api/api.schemas").LessonSummaryRecord & {
  domainId: string;
  domainName: string;
  chapterTitle: string;
  volume: "V1" | "V2";
  chapterNumber: number;
  publishedRevisionNumber: number | null;
};
export type LessonLibraryPage = {
  items: LessonLibraryItem[];
  total: number;
  page: number;
  pageSize: number;
  summary: { total: number; published: number; drafts: number; chapters: number };
};
