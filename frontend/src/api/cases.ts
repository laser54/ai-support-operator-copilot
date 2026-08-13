import type { ApiClient } from "./client";
import type { CaseResponse, ReviewRequest, TraceResponse } from "./types";

export function createCasesApi(client: ApiClient) {
  return {
    create(requestText: string) {
      return client.post<CaseResponse>("/cases", { request_text: requestText });
    },
    get(caseId: string) {
      return client.get<CaseResponse>(`/cases/${caseId}`);
    },
    review(caseId: string, body: ReviewRequest) {
      return client.post<CaseResponse>(`/cases/${caseId}/review`, body);
    },
    trace(caseId: string) {
      return client.get<TraceResponse>(`/cases/${caseId}/trace`);
    },
  };
}
