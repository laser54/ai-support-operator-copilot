import { createApiClient } from "./client";
import { createCasesApi } from "./cases";
import { requireApiBaseUrl } from "./env";

export function getApiBaseUrl(): string {
  return requireApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
}

export function getCasesApi() {
  return createCasesApi(createApiClient({ baseUrl: getApiBaseUrl() }));
}
