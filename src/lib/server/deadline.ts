export async function withDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
  timeoutError: () => Error,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(timeoutError()), timeoutMs);
  });

  try {
    return await Promise.race([operation, deadline]);
  } finally {
    clearTimeout(timeout);
  }
}
