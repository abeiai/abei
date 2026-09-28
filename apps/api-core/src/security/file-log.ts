import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

type LogFile = "requests" | "errors";

const logFiles: Record<LogFile, string> = {
  requests: "requests.log",
  errors: "errors.log"
};

export function appendJsonLog(file: LogFile, payload: Record<string, unknown>) {
  const logDir = process.env.LOG_DIR;

  if (!logDir) {
    return;
  }

  void writeLogLine(logDir, logFiles[file], payload);
}

async function writeLogLine(logDir: string, fileName: string, payload: Record<string, unknown>) {
  try {
    await mkdir(logDir, {
      recursive: true
    });
    await appendFile(
      join(logDir, fileName),
      `${JSON.stringify({
        ...payload,
        loggedAt: new Date().toISOString()
      })}\n`,
      "utf8"
    );
  } catch {
    // 日志写入失败不能影响主业务请求。
  }
}
