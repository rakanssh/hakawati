export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const abortError = () =>
  new DOMException("Request cancelled.", "AbortError");

export const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

const OUTPUT_LIMIT = Symbol.for("hakawati.outputLimit");

export const markOutputLimit = <T extends Error>(error: T): T =>
  Object.assign(error, { [OUTPUT_LIMIT]: true });

export const isOutputLimitError = (error: unknown) =>
  error instanceof Error && OUTPUT_LIMIT in error;
