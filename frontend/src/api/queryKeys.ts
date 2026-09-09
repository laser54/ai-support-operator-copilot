import type { CaseQueueParams } from "./types";

export const queryKeys = {
  case: (caseId: string) => ["case", caseId] as const,
  caseTrace: (caseId: string) => ["case-trace", caseId] as const,
  casesList: (params?: CaseQueueParams) => ["cases", "list", params] as const,
  casesAll: () => ["cases"] as const,
};
