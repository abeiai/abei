export const VIDEO_GUIDE_NARRATION_BATCH_SIZE = 4;

export class NarrationBatchOutputError extends Error {}

export function createNarrationBatches<TItem>(items: TItem[], batchSize: number) {
  const normalizedSize = Math.max(1, Math.floor(batchSize));
  const batches: TItem[][] = [];

  for (let index = 0; index < items.length; index += normalizedSize) {
    batches.push(items.slice(index, index + normalizedSize));
  }

  return batches;
}

export async function runAdaptiveNarrationBatch<TItem, TResult>(input: {
  items: TItem[];
  maxAttempts: number;
  generate: (items: TItem[], attempt: number) => Promise<TResult[]>;
  onSuccess?: (results: TResult[], items: TItem[]) => Promise<void>;
  shouldRetry?: (error: unknown) => boolean;
  retryDelayMs?: (attempt: number, error: unknown) => number;
  sleep?: (milliseconds: number) => Promise<void>;
}): Promise<TResult[]> {
  const maxAttempts = Math.max(1, Math.floor(input.maxAttempts));
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const results = await input.generate(input.items, attempt);

      await input.onSuccess?.(results, input.items);
      return results;
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts && (input.shouldRetry?.(error) ?? true)) {
        const delayMs = Math.max(0, input.retryDelayMs?.(attempt, error) ?? 0);

        if (delayMs > 0) {
          await (input.sleep ?? delay)(delayMs);
        }
      } else {
        break;
      }
    }
  }

  if (!(lastError instanceof NarrationBatchOutputError) || input.items.length <= 1) {
    throw lastError;
  }

  const midpoint = Math.ceil(input.items.length / 2);
  const firstHalf = await runAdaptiveNarrationBatch({
    ...input,
    items: input.items.slice(0, midpoint)
  });
  const secondHalf = await runAdaptiveNarrationBatch({
    ...input,
    items: input.items.slice(midpoint)
  });

  return [...firstHalf, ...secondHalf];
}

export async function mapWithConcurrency<TItem, TResult>(
  items: TItem[],
  concurrency: number,
  worker: (item: TItem, index: number) => Promise<TResult>
): Promise<TResult[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;
  let firstError: unknown;

  const runWorker = async () => {
    while (nextIndex < items.length && firstError === undefined) {
      const index = nextIndex;
      nextIndex += 1;

      try {
        results[index] = await worker(items[index]!, index);
      } catch (error) {
        firstError ??= error;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => runWorker())
  );

  if (firstError !== undefined) {
    throw firstError;
  }

  return results;
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
