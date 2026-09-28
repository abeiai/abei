import { spawn } from "node:child_process";

import { createLocalDevProxy } from "./local-proxy.mjs";

const proxy = createLocalDevProxy();
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
let stopped = false;

function closeProxy() {
  return new Promise((resolve) => {
    proxy.close(() => resolve());
  });
}

function stop(signal) {
  if (stopped) {
    return;
  }

  stopped = true;
  devProcess.kill(signal);
  void closeProxy();
}

await new Promise((resolve, reject) => {
  proxy.once("error", reject);
  proxy.listen(3320, "127.0.0.1", () => {
    proxy.off("error", reject);
    resolve();
  });
});

console.log("本地统一入口：http://localhost:3320");
const devProcess = spawn(command, ["-r", "dev"], {
  cwd: process.cwd(),
  stdio: "inherit"
});

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));

devProcess.once("exit", async (code) => {
  stopped = true;
  await closeProxy();
  process.exit(code ?? 1);
});
