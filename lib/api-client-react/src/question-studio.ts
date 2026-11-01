import type {
  AdminQuestion,
  AdminQuestionDifficulty,
  AdminQuestionStatus,
} from "./generated/api.schemas";
import type { Assignment } from "./admin-content";
export type StudioObjective = Assignment & {
  code: string;
  domainId: string;
  domain: string;
  version: string;
};
export type StudioRow = {
  id: string;
  questionCode: string;
  text: string;
  topicId: string;
  topicName: string;
  topicSlug: string;
  difficulty: AdminQuestionDifficulty;
  status: AdminQuestionStatus;
  createdAt: string;
  updatedAt: string;
  editToken: string;
  objectives: StudioObjective[];
  chapterIds: string[];
};
export type StudioPage = {
  items: StudioRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: {
    total: number;
    active: number;
    disabled: number;
    missingChapters: number;
    easy: number;
    medium: number;
    hard: number;
  };
};
export type StudioDetail = {
  objectiveDetails?: {
    objectiveId: string;
    code: string;
    description: string;
    blueprintId: string;
    domain: string;
    domainId?: string;
    version: string;
  }[];
  question: AdminQuestion;
  editToken: string;
  assignments: Assignment[];
  topicName: string;
  topicSlug: string;
  chapterIds: string[];
  revisionCount: number;
  revisionPage: number;
  revisions: { id: string; contentHash: string; createdAt: string }[];
};
export type StudioLookupItem = {
  id: string;
  label: string;
  slug?: string;
  chapterIds?: string[];
  status?: string;
  blueprintId?: string;
  domainId?: string;
  code?: string;
};
export type StudioLookup = { items: StudioLookupItem[]; hasMore: boolean; page: number };
