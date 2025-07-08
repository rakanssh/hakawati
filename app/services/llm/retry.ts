export async function withRetry<T>(
  fn: () => Promise<T>,
  max = 3,
  baseDelay = 500
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      if (++attempt > max || !shouldRetry(err)) throw err;
      await new Promise((r) => setTimeout(r, baseDelay * 2 ** (attempt - 1)));
    }
  }
}

function shouldRetry(e: any) {
  return /429|502|503/.test(e.message);
}
