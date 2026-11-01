import { customFetch } from "./custom-fetch";
export type ExamMapping = {
  chapter: { id: string; code: string; title: string; volume: string; chapterNumber: number };
  domain: { id: string; code: string; name: string };
};
export type ExamBreakdown = {
  id: string;
  name?: string;
  title?: string;
  total: number;
  correct: number;
  incorrect: number;
  unanswered: number;
};
export type ExamScore = {
  total: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  percentage: number;
  completionSeconds: number;
  domains: ExamBreakdown[];
  chapters: ExamBreakdown[];
  gradingPolicy: string;
};
export type ExamItem = {
  deliveryId: string;
  position: number;
  removed: boolean;
  questionCode: string;
  questionId?: string;
  revisionId?: string;
  text?: string;
  type?: "MULTIPLE_CHOICE_SINGLE" | "MULTIPLE_CHOICE_MULTIPLE";
  difficulty?: string;
  options?: { optionKey: string; text: string }[];
  requiredSelectionCount?: number;
  mapping?: ExamMapping;
  selectedOptionKeys?: string[];
  flagged?: boolean;
  answerVersion?: number;
  result?: { outcome: string; isCorrect: boolean };
  review?: {
    correctOption: { optionKey: string; text: string };
    correctOptions?: { optionKey: string; text: string }[];
    explanation: string;
  };
};
export type ExamRun = {
  id: string;
  status: "ACTIVE" | "SUBMITTED" | "EXPIRED";
  config: Record<string, unknown>;
  startedAt: string;
  deadlineAt: string;
  serverNow: string;
  finalizedAt: string | null;
  needsFinalization: boolean;
  contentRemoved: boolean;
  questionCount: number;
  result: ExamScore | null;
  questions: ExamItem[];
};
export type ExamAvailability = {
  ready: boolean;
  available: number;
  chapters: {
    id: string;
    code: string;
    title: string;
    volume: string;
    chapterNumber: number;
    domainId: string;
    domainCode: string;
    domainName: string;
    weight: number;
    available: number;
  }[];
  limits: { maxQuestions: number; minMinutes: number; maxMinutes: number };
  gradingPolicy: string;
};
export type ExamHistory = {
  items: {
    id: string;
    status: string;
    startedAt: string;
    deadlineAt: string;
    finalizedAt: string | null;
    questionCount: number;
    result: ExamScore | null;
    contentRemoved: boolean;
  }[];
  total: number;
  page: number;
  totalPages: number;
};
export function examRequest<T>(path: string, options: Parameters<typeof customFetch>[1] = {}) {
  return customFetch<T>("/api/exams" + path, {
    cache: "no-store",
    credentials: "same-origin",
    ...options,
  });
}
