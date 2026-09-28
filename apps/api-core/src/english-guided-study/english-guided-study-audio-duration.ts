import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { HttpStatus } from "@nestjs/common";
import { AppException } from "../common/app-exception.js";

const execFileAsync = promisify(execFile);

export function parseFfprobeDurationMs(output: string) {
  const seconds = Number(output.trim());

  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw durationException();
  }

  return Math.max(1, Math.ceil(seconds * 1000));
}

export function totalNarrationDurationMs(nodes: Array<{ durationMs: number }>) {
  return nodes.reduce((total, node) => total + Math.max(0, Math.round(node.durationMs)), 0);
}

export async function probeAudioDurationMs(audioUrl: string) {
  try {
    const result = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audioUrl],
      {
        timeout: 30_000,
        maxBuffer: 64 * 1024
      }
    );

    return parseFfprobeDurationMs(String(result.stdout));
  } catch (error) {
    if (error instanceof AppException) throw error;
    throw durationException();
  }
}

function durationException() {
  return new AppException(50201, "无法读取讲解音频真实时长", HttpStatus.BAD_GATEWAY);
}
