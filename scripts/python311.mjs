#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const candidates = [
  process.env.PYTHON_BIN,
  process.env.PYTHON,
  "python3.12",
  "python3.11",
  "python3"
].filter(Boolean);

for (const candidate of candidates) {
  const version = spawnSync(candidate, [
    "-c",
    "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)"
  ], {
    stdio: "ignore"
  });

  if (version.status !== 0) {
    continue;
  }

  const result = spawnSync(candidate, args, {
    env: process.env,
    stdio: "inherit"
  });

  process.exit(result.status ?? 1);
}

console.error("AI Gateway requires Python 3.11+. Install python3.12/python3.11 or set PYTHON_BIN.");
process.exit(1);
