/**
 * Delay utility - Promise-based sleep
 */
export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry utility with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
  },
): Promise<T> {
  const maxAttempts = options?.maxAttempts || 3;
  const initialDelayMs = options?.initialDelayMs || 1000;
  const maxDelayMs = options?.maxDelayMs || 30000;
  const backoffMultiplier = options?.backoffMultiplier || 2;

  let lastError: Error | undefined;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxAttempts) {
        await delay(delayMs);
        delayMs = Math.min(delayMs * backoffMultiplier, maxDelayMs);
      }
    }
  }

  throw lastError || new Error('Unknown error');
}
