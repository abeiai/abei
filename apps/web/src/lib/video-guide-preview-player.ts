export interface PreviewSubtitleCue {
  endSeconds: number;
  startSeconds: number;
  text: string;
}

export function findPreviewSubtitleCue(cues: PreviewSubtitleCue[], seconds: number) {
  if (!Number.isFinite(seconds)) {
    return null;
  }

  return cues.find((cue) => seconds >= cue.startSeconds && seconds < cue.endSeconds) ?? null;
}

export function findPreviewSubtitleLoopRange(cues: PreviewSubtitleCue[], seconds: number) {
  const cue = findPreviewSubtitleCue(cues, seconds);

  return cue
    ? {
        startSeconds: cue.startSeconds,
        endSeconds: cue.endSeconds
      }
    : null;
}
