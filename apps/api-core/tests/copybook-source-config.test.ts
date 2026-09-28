import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";

import {
  copybookSourceConfigVersion,
  normalizeCopybookSourceConfig
} from "../src/copybooks/copybook-source-config.js";
import { CopybooksService } from "../src/copybooks/copybooks.service.js";

process.env.DATABASE_URL ??= "postgresql://xueleai:xueleai_dev_password@localhost:3324/xueleai?schema=public";

test("仅姓名贴生成请求保存版本化设置快照", () => {
  const sourceConfig = {
    version: 1,
    templateId: "name-label",
    content: "姓名：张三"
  };

  assert.deepEqual(normalizeCopybookSourceConfig(sourceConfig, "name-label"), sourceConfig);
  assert.equal(normalizeCopybookSourceConfig(sourceConfig, "shengzi"), null);
  assert.equal(copybookSourceConfigVersion, 1);
});

test("姓名贴设置快照拒绝错误版本和过大内容", () => {
  assert.throws(
    () => normalizeCopybookSourceConfig({ version: 2, templateId: "name-label" }, "name-label"),
    /姓名贴设置数据无效/
  );
  assert.throws(
    () =>
      normalizeCopybookSourceConfig(
        {
          version: 1,
          templateId: "name-label",
          background: "x".repeat(6 * 1024 * 1024)
        },
        "name-label"
      ),
    /姓名贴设置数据过大/
  );
});

test("姓名贴设置按当前用户和记录编号读取", async () => {
  const calls: unknown[] = [];
  const sourceConfig = { version: 1, templateId: "name-label", content: "姓名：张三" };
  const service = new CopybooksService({} as never, {} as never);

  Object.defineProperty(service, "prisma", {
    value: {
      copybookRecord: {
        findFirst: async (input: unknown) => {
          calls.push(input);
          return {
            sourceConfig,
            sourceConfigVersion: 1,
            templateId: "name-label"
          };
        }
      }
    }
  });

  assert.deepEqual(
    await service.source({ userId: "user-1", mode: "ACCOUNT", learnerId: null }, "record-1"),
    { sourceConfig }
  );
  assert.deepEqual(calls[0], {
    where: {
      id: "record-1",
      userId: "user-1"
    },
    select: {
      sourceConfig: true,
      sourceConfigVersion: true,
      templateId: true
    }
  });
});
