import { HttpStatus } from "@nestjs/common";
import { AppException } from "../common/app-exception.js";

// The deadline covers the full response body, including slow R2 downloads.
export const mediaTransferTimeoutMs = 120_000;

class TransientMediaTransferError extends Error {}

export async function assertMediaTransferResponse(response: Response, message: string) {
  if (response.ok) return;
  await response.body?.cancel().catch(() => undefined);
  if ([408, 425, 429].includes(response.status) || response.status >= 500) {
    throw new TransientMediaTransferError(message);
  }
  throw new AppException(50201, message, HttpStatus.BAD_GATEWAY);
}

export async function retryMediaTransfer<T>(operation: () => Promise<T>, message: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      const transient = error instanceof TransientMediaTransferError ||
        (error instanceof Error && (["TimeoutError", "AbortError"].includes(error.name) ||
          (error instanceof TypeError && ["fetch failed", "terminated"].includes(error.message))));
      if (!transient) throw error;
      if (attempt >= 3) throw new AppException(50201, message, HttpStatus.BAD_GATEWAY);
      await new Promise(resolve => setTimeout(resolve, 200 * attempt));
    }
  }
}
