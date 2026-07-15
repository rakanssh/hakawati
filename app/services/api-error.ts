export type ParsedApiError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
  payload: Record<string, unknown>;
};

export function asApiObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseApiResponseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function parseApiError(
  value: unknown,
  status: number,
  fallbackMessage = "",
): ParsedApiError {
  const payload = asApiObject(value);
  const code =
    typeof payload.code === "string" && payload.code.trim()
      ? payload.code
      : typeof payload.type === "string" && payload.type.trim()
        ? payload.type
        : String(status);
  const message =
    typeof payload.message === "string" && payload.message.trim()
      ? payload.message
      : fallbackMessage.trim() || `Request failed (${status})`;

  const details = asApiObject(payload.details);
  const requestId =
    typeof payload.requestId === "string" && payload.requestId.trim()
      ? payload.requestId
      : undefined;

  return {
    code,
    message,
    ...(Object.keys(details).length > 0 ? { details } : {}),
    ...(requestId ? { requestId } : {}),
    payload,
  };
}
