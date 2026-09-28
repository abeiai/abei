export const videoGuideVideoMaxBytes = 500 * 1024 * 1024;
export const videoGuideAudioMaxBytes = 100 * 1024 * 1024;
export const videoGuideMediaMaxBytes = videoGuideVideoMaxBytes;

export function videoGuideMediaMaxBytesFor(mediaType: "VIDEO" | "AUDIO") {
  return mediaType === "AUDIO" ? videoGuideAudioMaxBytes : videoGuideVideoMaxBytes;
}
