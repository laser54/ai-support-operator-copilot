import type { ApiClient } from "./client";
import type {
  ArtifactEntry,
  CaseQueueParams,
  CaseQueueResponse,
  CaseResponse,
  ReviewRequest,
  SaveDraftRequest,
  TraceResponse,
} from "./types";

export function createCasesApi(client: ApiClient) {
  return {
    list(params?: CaseQueueParams) {
      const searchParams = new URLSearchParams();
      if (params?.status) searchParams.set("status", params.status);
      if (params?.priority) searchParams.set("priority", params.priority);
      if (params?.q?.trim()) searchParams.set("q", params.q.trim());
      if (params?.page && params.page > 1) searchParams.set("page", String(params.page));
      if (params?.page_size) searchParams.set("page_size", String(params.page_size));

      const query = searchParams.toString();
      const path = query ? `/cases?${query}` : "/cases";
      return client.get<CaseQueueResponse>(path);
    },
    create(requestText: string) {
      return client.post<CaseResponse>("/cases", { request_text: requestText });
    },
    get(caseId: string) {
      return client.get<CaseResponse>(`/cases/${caseId}`);
    },
    review(caseId: string, body: ReviewRequest) {
      return client.post<CaseResponse>(`/cases/${caseId}/review`, body);
    },
    saveDraft(caseId: string, body: SaveDraftRequest) {
      return client.put<CaseResponse>(`/cases/${caseId}/draft`, body);
    },
    resetDraft(caseId: string, actor: string = "operator") {
      return client.delete<CaseResponse>(
        `/cases/${caseId}/draft?actor=${encodeURIComponent(actor)}`,
      );
    },
    trace(caseId: string) {
      return client.get<TraceResponse>(`/cases/${caseId}/trace`);
    },
    listArtifacts() {
      return client.get<ArtifactEntry[]>("/artifacts");
    },
    saveArtifact(artifact: ArtifactEntry) {
      return client.post<ArtifactEntry>("/artifacts", artifact);
    },
    deleteArtifact(sourceId: string) {
      return client.delete(`/artifacts/${encodeURIComponent(sourceId)}`);
    },
  };
}
