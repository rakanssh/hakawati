export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const abortError = () =>
  new DOMException("Request cancelled.", "AbortError");

export const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";
