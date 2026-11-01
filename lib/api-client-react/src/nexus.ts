import type { CommandCenterSummary } from "./command-center/api.schemas";
import { customFetch } from "./custom-fetch";
export type NexusDomain = {
  id: string;
  code: string;
  name: string;
  version: string;
  available: number;
  attempted: number;
  attempts: number;
  correct: number;
  chapters: number;
  covered_chapters: number;
  recommendedTopic?: NexusTopic | null;
};
export type NexusTopic = {
  id: string;
  name: string;
  available: number;
  attempts: number;
  correct: number;
  attempted: number;
};
export type NexusHistoryRow = {
  id: string;
  mode: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  questionCount: number;
  removedCount?: number;
  answered: number;
  correct: number;
  topics: string;
};
export type NexusHistory = {
  items: NexusHistoryRow[];
  total: number;
  page: number;
  totalPages: number;
  persistence?: boolean;
};
export type NexusAnalytics = {
  commandCenter?: CommandCenterSummary;
  totals: {
    attempts: number;
    correct: number;
    unique: number;
    lastActivity: string | null;
    available: number;
    unmapped: number;
    unmappedAttempts: number;
  };
  domains: NexusDomain[];
  topics: NexusTopic[];
  timeline: { day: string; attempts: number; correct: number; incorrect?: number; completedSessions?: number; completedExams?: number }[];
  persistence: boolean;
  sessions: NexusHistory;
  resume: { id: string; mode: string; questionCount: number; createdAt: string } | null;
  range: string;
  granularity: string;
  taxonomyBasis: string;
  studyTime: null;
  streak: null;
};
export type NexusQuestion = {
  id: string;
  deliveryId: string;
  revisionId: string;
  expiresAt: string;
  questionCode: string;
  topic: { id: string; slug: string; name: string };
  text: string;
  difficulty: string;
  type?: "MULTIPLE_CHOICE_SINGLE" | "MULTIPLE_CHOICE_MULTIPLE";
  requiredSelectionCount?: number;
  options: { optionKey: string; text: string }[];
  selected: string | null;
  flagged: boolean;
  submitted?: boolean;
  domains: { id: string; code: string; name: string }[];
  result: {
    isCorrect: boolean;
    correctOption: { optionKey: string; text: string };
    correctOptions?: { optionKey: string; text: string }[];
    explanation: string;
  } | null;
};
export type NexusRun = {
  removedQuestions?: {position:number;questionCode:string;deletedAt:string}[];
  id: string | null;
  mode: string;
  status: string;
  persistence: boolean;
  canResume: boolean;
  questions: NexusQuestion[];
  createdAt?: string;
  completedAt?: string;
};
export type NexusAvailability = {
  available: number;
  persistence: boolean;
  topics: { id: string; name: string; available: number }[];
};
export function nexusRequest<T>(path: string, options: Parameters<typeof customFetch>[1] = {}) {
  const headers = new Headers(options.headers);
  if (options.method && options.method !== "GET")
    headers.set("X-Learner-Timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);
  return customFetch<T>("/api/nexus/" + path, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers,
  });
}
export type LearningActivity = {
  year: number;
  timezone: string;
  days: { date: string; answers: number; sessions: number; total: number; level: number }[];
  totals: { answers: number; sessions: number; activeDays: number; longestStreak: number };
  supportedEvents: {
    ANSWER_SUBMITTED: boolean;
    PRACTICE_COMPLETED: boolean;
    LESSON_COMPLETED: boolean;
    LAB_COMPLETED: boolean;
  };
};
export type LearningSkill = {
  id: string;
  code: string;
  name: string;
  available: number;
  attempted: number;
  attempts: number;
  correct: number;
  accuracy: number | null;
  coverage: number | null;
  score: number | null;
  status: string;
};
export type LearningBadge = {
  id: string;
  name: string;
  description: string;
  awardedAt: string | null;
  awardEvidence: { timezone?: string } | null;
  supported: boolean;
  eligible: boolean;
  progress: number;
  requirements: { label: string; current: number; target: number }[];
};
export type LearnerProgress = {
  timezone: string;
  framework: {
    id: string;
    name: string;
    version: number;
    minimumAnswers: number;
    minimumUnique: number;
    sampleTarget: number;
    scoreLabel: string;
  };
  skills: LearningSkill[];
  capabilities: { sessions: boolean; achievements: boolean };
  evidence: {
    attempts: number;
    correct: number;
    unique: number;
    sessions: number;
    streak: number;
    legacyAnswers: number;
  };
  badges: LearningBadge[];
};
