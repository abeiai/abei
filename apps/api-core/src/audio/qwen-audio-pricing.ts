interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export function estimateQwenAudioTokenUsage(characterCount: number): TokenUsage {
  const count = Math.max(0, Math.ceil(characterCount));
  return { inputTokens: count * 2, outputTokens: count * 8 };
}

export function extractQwenAudioTokenUsage(payload: unknown): TokenUsage | null {
  const root = record(payload);
  const usage = record(root?.usage);
  const providerUsage = record(usage?.providerUsage) ?? record(record(root?.raw)?.usage);
  const inputTokens = tokenCount(providerUsage?.input_tokens ?? providerUsage?.inputTokens);
  const outputTokens = tokenCount(providerUsage?.output_tokens ?? providerUsage?.outputTokens);
  return inputTokens === null || outputTokens === null ? null : { inputTokens, outputTokens };
}

export function qwenAudioTokenCost(usage: TokenUsage, inputPrice: number, outputPrice: number): number {
  return (usage.inputTokens * inputPrice + usage.outputTokens * outputPrice) / 1_000_000;
}

export function confirmedQwenAudioCredits(
  payload: unknown,
  inputPrice: number,
  outputPrice: number,
  creditsPerCny: number,
  confirmedCredits: number
): number {
  const tokens = extractQwenAudioTokenUsage(payload);
  if (!tokens) return confirmedCredits;
  const cost = qwenAudioTokenCost(tokens, inputPrice, outputPrice);
  return Math.min(confirmedCredits, Math.max(cost > 0 ? 1 : 0, Math.ceil(cost * creditsPerCny)));
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function tokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
