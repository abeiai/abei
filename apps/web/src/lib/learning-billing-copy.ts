const exactBillingOperations = new Set([
  "ENGLISH_GUIDED_STUDY_ASR",
  "ENGLISH_GUIDED_STUDY_TTS",
  "VIDEO_GUIDE_NARRATION_TTS"
]);

export function learningBillingConsumptionLabel(operation: string) {
  return exactBillingOperations.has(operation) ? "本次消耗" : "本次预计消耗";
}
