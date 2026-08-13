export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export type ApiClient = {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body: unknown) => Promise<T>;
  delete: (path: string) => Promise<void>;
};

type ApiClientOptions = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
};

type ErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
  };
};

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

async function parseError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as ErrorEnvelope | null;
  return new ApiError(
    response.status,
    body?.error?.code ?? "http_error",
    body?.error?.message ?? `Request failed with ${response.status}`,
  );
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await parseError(response);
  }
  return (await response.json()) as T;
}

async function readEmpty(response: Response): Promise<void> {
  if (!response.ok) {
    throw await parseError(response);
  }
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async get<T>(path: string): Promise<T> {
      const response = await fetchImpl(joinUrl(options.baseUrl, path), {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      return readJson<T>(response);
    },

    async post<T>(path: string, body: unknown): Promise<T> {
      const response = await fetchImpl(joinUrl(options.baseUrl, path), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      return readJson<T>(response);
    },
    async delete(path: string): Promise<void> {
      const response = await fetchImpl(joinUrl(options.baseUrl, path), {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      await readEmpty(response);
    },
  };
}
