import {
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  type ApiFailure,
  type ApiResult,
  type FieldErrors,
} from "./types";

export type ApiPath = `/api/${string}`;

export interface ApiCallInit extends Omit<RequestInit, "body"> {
  /** Serialized as JSON. */
  body?: unknown;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly fieldErrors: FieldErrors = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const NETWORK_ERROR: ApiFailure = {
  ok: false,
  error: { code: "NETWORK_ERROR", message: "Network error. Check your connection and try again." },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isApiResult(value: unknown): value is ApiResult<unknown> {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return false;
  }

  if (value.ok) {
    return "data" in value;
  }

  return isRecord(value.error) && typeof value.error.code === "string" && typeof value.error.message === "string";
}

/** Parses a response body without throwing; `undefined` means "not JSON". */
export function readJsonSafe(text: string): unknown {
  if (text === "") {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    // Not JSON (e.g. an HTML error page from a proxy); the caller reports it as an invalid response.
    return undefined;
  }
}

/**
 * The only sanctioned way to call `/api/*` from the browser: sends the CSRF header,
 * serializes the body and always resolves to a typed `ApiResult` (never throws).
 */
export async function apiCall<T>(path: ApiPath, init: ApiCallInit = {}): Promise<ApiResult<T>> {
  const { body, headers, ...rest } = init;
  const requestHeaders = new Headers(headers);
  requestHeaders.set("accept", "application/json");
  requestHeaders.set(CSRF_HEADER, CSRF_HEADER_VALUE);

  if (body !== undefined) {
    requestHeaders.set("content-type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(path, {
      ...rest,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return NETWORK_ERROR;
  }

  const parsed = readJsonSafe(await response.text());

  if (isApiResult(parsed)) {
    return parsed as ApiResult<T>;
  }

  return {
    ok: false,
    error: { code: "INVALID_RESPONSE", message: `Unexpected response from the server (HTTP ${response.status}).` },
  };
}

/** Like `apiCall`, but returns the data or throws `ApiError`. */
export async function apiCallOrThrow<T>(path: ApiPath, init?: ApiCallInit): Promise<T> {
  const result = await apiCall<T>(path, init);

  if (!result.ok) {
    throw new ApiError(result.error.code, result.error.message, result.error.fieldErrors);
  }

  return result.data;
}
