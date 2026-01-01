/**
 * Type guard to check if a Promise.allSettled result is fulfilled.
 */
export function isFulfilled<T>(result: PromiseSettledResult<T>): result is PromiseFulfilledResult<T> {
  return result.status === 'fulfilled';
}


