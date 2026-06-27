let localOperationQueue: Promise<unknown> = Promise.resolve();

export function enqueueLocalOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const next = localOperationQueue.then(operation, operation);
  localOperationQueue = next.catch(() => undefined);
  return next;
}

export function enqueueLocalWrite<T>(operation: () => Promise<T>): Promise<T> {
  return enqueueLocalOperation(operation);
}
