interface NarrationTtsResumeInput {
  draftRevision: string;
  narrationTtsModelAlias: string;
  narrationVoice: string;
}

export function resumableNarrationTtsCheckpointId(
  contentValue: unknown,
  expected: NarrationTtsResumeInput
) {
  const content = isRecord(contentValue) ? contentValue : null;
  const operationProgress = content && isRecord(content.narrationTtsGenerationProgress)
    ? content.narrationTtsGenerationProgress
    : null;
  const job = content && isRecord(content.narrationTtsGenerationJob)
    ? content.narrationTtsGenerationJob
    : null;
  const input = job && isRecord(job.input) ? job.input : null;
  const audioProgress = content && isRecord(content.narrationAudioProgress)
    ? content.narrationAudioProgress
    : null;
  const checkpointId = stringValue(input?.checkpointId);

  if (
    operationProgress?.status !== "FAILED" ||
    job?.operation !== "NARRATION_TTS" ||
    !checkpointId ||
    stringValue(audioProgress?.generationId) !== checkpointId ||
    stringValue(input?.draftRevision) !== expected.draftRevision ||
    stringValue(input?.narrationTtsModelAlias) !== expected.narrationTtsModelAlias ||
    stringValue(input?.narrationVoice) !== expected.narrationVoice
  ) {
    return null;
  }

  return checkpointId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
