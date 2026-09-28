import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(
  currentDirectory,
  "migrate-production-isolation.sh",
);

async function readMigrationScript() {
  return readFile(scriptPath, "utf8");
}

test("生产隔离迁移脚本提供显式预演和执行模式", async () => {
  const script = await readMigrationScript();

  assert.match(script, /^#!\/usr\/bin\/env bash/m);
  assert.match(script, /set -Eeuo pipefail/);
  assert.match(script, /--dry-run/);
  assert.match(script, /--execute/);
  assert.match(script, /--help/);
  assert.match(script, /flock/);
});

test("生产隔离迁移脚本固定源和目标身份", async () => {
  const script = await readMigrationScript();

  for (const identifier of [
    "xueleai_postgres_data",
    "xueleai_redis_data",
    "xueleai-prod",
    "xueleai-prod_postgres_data",
    "xueleai-prod_redis_data",
  ]) {
    assert.match(script, new RegExp(identifier.replaceAll("-", "\\-")));
  }

  for (const setting of [
    "POSTGRES_USER",
    "POSTGRES_DB",
    "DATABASE_URL",
    "DOCKER_DATABASE_URL",
    "COMPOSE_PROJECT_NAME",
    "POSTGRES_VOLUME_NAME",
    "REDIS_VOLUME_NAME",
  ]) {
    assert.match(script, new RegExp(setting));
  }
});

test("生产隔离迁移脚本先备份并校验数据库内容再切换", async () => {
  const script = await readMigrationScript();

  assert.match(
    script,
    /deploy\/data\/backups\/production-isolation/,
  );
  assert.match(script, /pg_dump/);
  assert.match(script, /pg_restore/);
  assert.match(script, /--no-owner/);
  assert.match(script, /--no-acl/);
  assert.match(script, /database_manifest/);
  assert.match(script, /sequence_manifest/);
  assert.match(script, /row_to_json/);
  assert.match(script, /diff -u/);
  assert.match(script, /sha256sum/);

  const executeBody =
    script.match(/execute_migration\(\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const restoreIndex = executeBody.indexOf("restore_target_database");
  const compareIndex = executeBody.indexOf("compare_database_manifests");
  const switchIndex = executeBody.indexOf("start_target_project");

  assert.ok(restoreIndex >= 0, "必须定义目标数据库恢复步骤");
  assert.ok(compareIndex > restoreIndex, "必须先恢复再比较数据清单");
  assert.ok(switchIndex > compareIndex, "必须通过数据比较后才能切换环境");
});

test("生产隔离迁移在开放应用前复验真实 Compose 数据容器", async () => {
  const script = await readMigrationScript();

  assert.match(script, /redis_volume_manifest/);
  assert.match(script, /redis-source-volume\.tsv/);
  assert.match(script, /redis-target-volume\.tsv/);
  assert.match(script, /verify_live_data_services/);
  assert.match(script, /assert_container_volume/);
  assert.match(
    script,
    /is_target_already_active\(\)[\s\S]*container_mounts_volume[\s\S]*SELECT current_user, current_database\(\)/,
  );
  assert.match(
    script,
    /start_target_project\(\)[\s\S]*assert_container_volume[\s\S]*db:migrate:deploy/,
  );
  assert.match(
    script,
    /start_target_project\(\)[\s\S]*verify_live_data_services[\s\S]*Starting the complete isolated production stack/,
  );
});

test("生产隔离迁移脚本保留旧环境并提供自动回滚", async () => {
  const script = await readMigrationScript();

  assert.match(script, /rollback_environment/);
  assert.match(script, /rollback\.sh/);
  assert.match(script, /\.env\.production\.before-migration/);
  assert.match(script, /KEEP_OLD_ROLLBACK_ASSETS/);
  assert.match(script, /trap .*ERR/);
  assert.match(script, /docker volume create/);
  assert.match(script, /redis-cli.*SAVE/);
});

test("备份目录中的人工回滚脚本隔离宿主变量并完成健康检查", async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "xueleai-manual-rollback-"),
  );
  const environmentPath = path.join(temporaryDirectory, ".env.production");
  const backupPath = path.join(
    temporaryDirectory,
    ".env.production.before-migration",
  );

  await writeFile(environmentPath, "COMPOSE_PROJECT_NAME=xueleai-prod\n");
  await writeFile(backupPath, "COMPOSE_PROJECT_NAME=xueleai\n");

  try {
    const result = spawnSync(
      "bash",
      [
        "-c",
        [
          'source "$1"',
          'ROOT_DIR="$2"',
          'COMPOSE_FILE="$2/docker-compose.prod.yml"',
          'ENV_FILE="$3"',
          'BACKUP_DIR="$2"',
          'ENV_BACKUP="$4"',
          "write_rollback_script",
        ].join("; "),
        "bash",
        scriptPath,
        temporaryDirectory,
        environmentPath,
        backupPath,
      ],
      { encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const rollback = await readFile(
      path.join(temporaryDirectory, "rollback.sh"),
      "utf8",
    );
    assert.match(rollback, /env\s+-i/);
    assert.match(rollback, /wait_for_service/);
    assert.match(rollback, /api\/health/);
    assert.match(rollback, /api\/system-config\/public/);
    assert.match(rollback, /media-tutor/);
    assert.match(rollback, /Rollback completed and verified/);
    assert.doesNotMatch(rollback, /Rollback startup completed/);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("生产隔离迁移只原位替换连接身份并保留原始密钥转义", async () => {
  const script = await readMigrationScript();

  assert.match(script, /replace_env_database_identity/);
  assert.match(script, /read_env_value/);
  assert.match(script, /container_env_value/);
  assert.doesNotMatch(script, /source\s+"\$\{ENV_FILE\}"/);
  assert.doesNotMatch(
    script,
    /set_env_value\s+"\$\{temporary_env\}"\s+"(?:DOCKER_)?DATABASE_URL"/,
  );
  const switchBody =
    script.match(/switch_environment\(\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.ok(
    switchBody.indexOf("ENV_SWITCHED=1") <
      switchBody.indexOf('mv "${temporary_env}" "${ENV_FILE}"'),
    "必须先进入可回滚状态，再原子替换生产环境文件",
  );
});

test("Compose 调用清除宿主旧变量并只采用指定 env 文件", async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "xueleai-compose-environment-"),
  );
  const fakeDockerPath = path.join(temporaryDirectory, "docker");
  const observedPath = path.join(temporaryDirectory, "observed.txt");
  const environmentPath = path.join(temporaryDirectory, ".env.production");

  await writeFile(
    fakeDockerPath,
    [
      "#!/bin/sh",
      `printf '%s\\n' "\${COMPOSE_PROJECT_NAME-unset}|\${POSTGRES_VOLUME_NAME-unset}|\${POSTGRES_USER-unset}" > "${observedPath}"`,
      "",
    ].join("\n"),
  );
  await chmod(fakeDockerPath, 0o700);
  await writeFile(environmentPath, "COMPOSE_PROJECT_NAME=xueleai-prod\n");

  try {
    const result = spawnSync(
      "bash",
      [
        "-c",
        [
          'source "$1"',
          'PATH="$2:/usr/bin:/bin"',
          'compose_with_env "$3" xueleai-prod ps',
        ].join("; "),
        "bash",
        scriptPath,
        temporaryDirectory,
        environmentPath,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          COMPOSE_PROJECT_NAME: "wrong-project",
          POSTGRES_VOLUME_NAME: "wrong-volume",
          POSTGRES_USER: "wrong-user",
        },
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(observedPath, "utf8"), "unset|unset|unset\n");
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("生产隔离迁移原子切换七项配置且不改变连接串密钥", async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "xueleai-production-isolation-"),
  );
  const environmentPath = path.join(temporaryDirectory, ".env.production");
  const passwordFragment = 'p$#\\"word';

  await writeFile(
    environmentPath,
    [
      "POSTGRES_USER=aisaas",
      "POSTGRES_DB=aisaas",
      `DATABASE_URL="postgresql://aisaas:${passwordFragment}@localhost:3324/aisaas?schema=public"`,
      `DOCKER_DATABASE_URL="postgresql://aisaas:${passwordFragment}@postgres:3327/aisaas?schema=public"`,
      "COMPOSE_PROJECT_NAME=xueleai",
      "POSTGRES_VOLUME_NAME=xueleai_postgres_data",
      "REDIS_VOLUME_NAME=xueleai_redis_data",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );

  try {
    const result = spawnSync(
      "bash",
      [
        "-c",
        'source "$1"; ENV_FILE="$2"; RUN_ID=contracttest; switch_environment',
        "bash",
        scriptPath,
        environmentPath,
      ],
      { encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const updated = await readFile(environmentPath, "utf8");
    assert.match(updated, /^POSTGRES_USER=xueleai$/m);
    assert.match(updated, /^POSTGRES_DB=xueleai$/m);
    assert.match(updated, /^COMPOSE_PROJECT_NAME=xueleai-prod$/m);
    assert.match(
      updated,
      /^POSTGRES_VOLUME_NAME=xueleai-prod_postgres_data$/m,
    );
    assert.match(updated, /^REDIS_VOLUME_NAME=xueleai-prod_redis_data$/m);
    assert.ok(
      updated.includes(
        `DATABASE_URL="postgresql://xueleai:${passwordFragment}@localhost:3324/xueleai?schema=public"`,
      ),
    );
    assert.ok(
      updated.includes(
        `DOCKER_DATABASE_URL="postgresql://xueleai:${passwordFragment}@postgres:3327/xueleai?schema=public"`,
      ),
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("切换后的失败会恢复原生产环境文件并保留失败状态", async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "xueleai-production-rollback-"),
  );
  const environmentPath = path.join(temporaryDirectory, ".env.production");
  const backupPath = path.join(
    temporaryDirectory,
    ".env.production.before-migration",
  );
  const sourceEnvironment = [
    "COMPOSE_PROJECT_NAME=xueleai",
    "POSTGRES_VOLUME_NAME=xueleai_postgres_data",
    "REDIS_VOLUME_NAME=xueleai_redis_data",
    "",
  ].join("\n");

  await writeFile(
    environmentPath,
    [
      "COMPOSE_PROJECT_NAME=xueleai-prod",
      "POSTGRES_VOLUME_NAME=xueleai-prod_postgres_data",
      "REDIS_VOLUME_NAME=xueleai-prod_redis_data",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  await writeFile(backupPath, sourceEnvironment, { mode: 0o600 });

  try {
    const result = spawnSync(
      "bash",
      [
        "-c",
        [
          'source "$1"',
          'ENV_FILE="$2"',
          'ENV_BACKUP="$3"',
          "WRITES_PAUSED=1",
          "ENV_SWITCHED=1",
          "MIGRATION_COMPLETE=0",
          "BACKUP_DIR=",
          "cleanup_runtime() { :; }",
          "compose_with_env() { :; }",
          "verify_rollback_health() { :; }",
          "rollback_environment 23",
        ].join("; "),
        "bash",
        scriptPath,
        environmentPath,
        backupPath,
      ],
      { encoding: "utf8" },
    );

    assert.equal(result.status, 23, result.stderr);
    assert.equal(await readFile(environmentPath, "utf8"), sourceEnvironment);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("停写后的 die 会进入回滚而不是直接绕过 ERR trap", async () => {
  const script = await readMigrationScript();

  const dieBody = script.match(/die\(\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.doesNotMatch(dieBody, /\bexit\b/);
  assert.match(dieBody, /rollback_environment/);
  assert.match(script, /ROLLBACK_IN_PROGRESS/);
  assert.match(script, /verify_rollback_health/);
});

test("生产隔离迁移脚本不包含破坏旧数据的命令", async () => {
  const script = await readMigrationScript();

  const forbiddenPatterns = [
    /docker\s+volume\s+rm/i,
    /docker\s+compose[^\n]*\bdown\b[^\n]*-v/i,
    /prisma\s+migrate\s+reset/i,
    /rm\s+-rf\s+[^\n]*(volume|backup|deploy\/data)/i,
  ];

  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(script, pattern);
  }
});
