import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function parseVideoDurationSeconds(output: string) {
  const duration = Number(output.trim());

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("无法读取视频时长");
  }

  return duration;
}

export function isVideoDurationShort(requestedDuration: number, actualDuration: number) {
  const toleranceSeconds = Math.max(0.25, requestedDuration * 0.05);

  return actualDuration < requestedDuration - toleranceSeconds;
}

export async function probeProviderVideoDurationSeconds(videoUrl: string, providerBaseUrl: string) {
  assertTrustedProviderVideoUrl(videoUrl, providerBaseUrl);

  const result = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", videoUrl],
    {
      timeout: 30_000,
      maxBuffer: 64 * 1024
    }
  );

  return parseVideoDurationSeconds(String(result.stdout));
}

function assertTrustedProviderVideoUrl(videoUrl: string, providerBaseUrl: string) {
  const video = new URL(videoUrl);
  const provider = new URL(providerBaseUrl);

  if (video.protocol !== "https:" || video.origin !== provider.origin) {
    throw new Error("视频地址不属于当前 Provider");
  }
}
