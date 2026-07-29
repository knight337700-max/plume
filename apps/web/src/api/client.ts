export interface NormalizedFieldError {
  readonly path: string;
  readonly message: string;
  readonly code: string;
}

export interface NormalizedProblem {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly instance?: string;
  readonly errors?: readonly NormalizedFieldError[];
  readonly requestId?: string;
}

export class ApiError extends Error {
  readonly problem: NormalizedProblem;

  constructor(problem: NormalizedProblem) {
    super(problem.detail);
    this.name = "ApiError";
    this.problem = problem;
  }
}

export interface ApiClientOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeProblem(
  payload: unknown,
  status: number,
  instance: string,
): NormalizedProblem {
  if (!isRecord(payload)) {
    return {
      type: "about:blank",
      title: "Internal Server Error",
      status,
      code: "INTERNAL_ERROR",
      detail: "An unexpected error occurred.",
      instance,
    };
  }
  const rawErrors = Array.isArray(payload.errors) ? payload.errors : [];
  const errors = rawErrors.flatMap((error) => {
    if (!isRecord(error)) return [];
    return [{
      path: stringValue(error.path, ""),
      message: stringValue(error.message, "Field validation failed"),
      code: stringValue(error.code, "FIELD_VALIDATION_FAILED"),
    }];
  });
  const problem: NormalizedProblem = {
    type: stringValue(payload.type, "about:blank"),
    title: stringValue(payload.title, "Request Failed"),
    status: numberValue(payload.status, status),
    code: stringValue(payload.code, "INTERNAL_ERROR"),
    detail: stringValue(payload.detail, "An unexpected error occurred."),
    instance,
    ...(errors.length ? { errors } : {}),
  };
  return {
    ...problem,
    ...(typeof payload.requestId === "string" ? { requestId: payload.requestId } : {}),
  };
}

function resolveUrl(baseUrl: string, path: string) {
  if (/^https?:\/\//.test(path)) return path;
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

async function readPayload(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function createApiClient({
  baseUrl = "/api/v1",
  fetcher = fetch,
}: ApiClientOptions = {}) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = resolveUrl(baseUrl, path);
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const response = await fetcher(url, { ...init, headers });
    const payload = await readPayload(response);
    if (!response.ok) throw new ApiError(normalizeProblem(payload, response.status, url));
    return payload as T;
  }
  return {
    request,
    get<T>(path: string, init?: RequestInit) {
      return request<T>(path, { ...init, method: "GET" });
    },
    post<T>(path: string, body: unknown, init?: RequestInit) {
      return request<T>(path, { ...init, method: "POST", body: JSON.stringify(body) });
    },
    put<T>(path: string, body: unknown, init?: RequestInit) {
      return request<T>(path, { ...init, method: "PUT", body: JSON.stringify(body) });
    },
    delete<T>(path: string, init?: RequestInit) {
      return request<T>(path, { ...init, method: "DELETE" });
    },
  };
}

export const apiClient = createApiClient();
