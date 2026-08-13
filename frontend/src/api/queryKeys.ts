export const queryKeys = {
  case: (caseId: string) => ["case", caseId] as const,
  caseTrace: (caseId: string) => ["case-trace", caseId] as const,
};
