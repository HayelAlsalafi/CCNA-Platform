import { customFetch, type CustomFetchOptions } from './custom-fetch';
export type Blueprint = {
  id: string;
  examCode: string;
  version: string;
  title: string;
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  sourceUrl: string | null;
  verifiedAt: string | null;
};
export type Domain = {
  id: string;
  blueprintId: string;
  code: string;
  name: string;
  weightPercent: number;
  displayOrder: number;
};
export type Objective = {
  id: string;
  domainId: string;
  blueprintId: string;
  domainCode: string;
  code: string;
  description: string;
  displayOrder: number;
};
export type Assignment = { objectiveId: string; blueprintId: string; isPrimary: boolean };
export type CanonicalChapter = {id:string;code:string;volume:"V1"|"V2";chapterNumber:number;domainId:string;domainCode:string;blueprintId:string;title:string;slug:string;description:string;status:"ACTIVE"|"DISABLED";displayOrder:number;version:string;questionCount:number};
export type TaxonomyCatalog = {
  canonicalReady?: boolean;
  chapters?: CanonicalChapter[];
  blueprints: Blueprint[];
  domains: Domain[];
  objectives: Objective[];
};
export type ImportSummary = {
  accepted: number;
  rejected: number;
  duplicates: number;
  total: number;
};
export type ImportPreview = {
  previewId: string;
  expiresAt: string;
  summary: ImportSummary;
  rows: {
    row: number;
    status: 'accepted' | 'rejected' | 'duplicate';
    text: string;
    errors: { path: string; message: string }[];
    question?: {
      topicId: string;
      text: string;
      difficulty: string;
      explanation: string;
      options: { optionKey: string; text: string; isCorrect: boolean }[];
    };
    objectives?: Assignment[];
  }[];
};
export type ImportResult = ImportSummary & {
  imported: number;
  status: 'DISABLED';
  questionIds: string[];
};
export function adminContentRequest<T>(path: string, options: CustomFetchOptions = {}) {
  return customFetch<T>(path, { credentials: 'same-origin', cache: 'no-store', ...options });
}
