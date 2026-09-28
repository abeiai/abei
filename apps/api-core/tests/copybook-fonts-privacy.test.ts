import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";

import { CopybookFontsService } from "../src/copybook-fonts/copybook-fonts.service.js";

process.env.DATABASE_URL ??= "postgresql://xueleai:xueleai_dev_password@localhost:3324/xueleai?schema=public";
process.env.PROFILE_CONTEXT_SECRET ??= "copybook-fonts-profile-context-test-secret";

function fontRecord(overrides: Record<string, unknown>) {
  const now = new Date("2026-07-30T00:00:00.000Z");

  return {
    id: "font-admin",
    name: "管理员字体",
    filename: "admin.ttf",
    originalName: "admin.ttf",
    mimeType: "font/ttf",
    size: 1024,
    url: "http://localhost:3322/api/fonts/files/admin.ttf",
    storageProvider: "LOCAL",
    suitableTemplates: ["shengzi"],
    sortOrder: 100,
    createdByAdminId: "admin-1",
    createdByUserId: null,
    createdAt: now,
    updatedAt: now,
    createdByAdmin: {
      id: "admin-1",
      email: "admin@example.com",
      name: "管理员"
    },
    ...overrides
  };
}

test("copybook fonts module can bootstrap without an explicit Prisma provider", async () => {
  const { NestFactory } = await import("@nestjs/core");
  const { CopybookFontsModule } = await import("../src/copybook-fonts/copybook-fonts.module.js");
  const app = await NestFactory.createApplicationContext(CopybookFontsModule, {
    logger: false
  });

  await app.close();
});

test("copybook font service keeps user fonts out of admin font management", async () => {
  const findManyCalls: unknown[] = [];
  const service = new CopybookFontsService({
    copybookFont: {
      findMany: async (input: unknown) => {
        findManyCalls.push(input);

        return [fontRecord({})];
      }
    }
  } as never);

  const fonts = await service.listFonts();

  assert.equal(fonts.length, 1);
  assert.deepEqual(findManyCalls[0], {
    where: {
      createdByUserId: null
    },
    include: {
      createdByAdmin: {
        select: {
          id: true,
          email: true,
          name: true
        }
      }
    },
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }]
  });
});

test("copybook font service only returns current user's private fonts in public list", async () => {
  const findManyCalls: unknown[] = [];
  const service = new CopybookFontsService({
    copybookFont: {
      findMany: async (input: unknown) => {
        findManyCalls.push(input);

        return [
          fontRecord({ id: "font-admin", name: "管理员字体", createdByUserId: null }),
          fontRecord({
            id: "font-user",
            name: "我的字体",
            filename: "user.ttf",
            url: "http://localhost:3322/api/fonts/files/user.ttf",
            createdByAdminId: null,
            createdByUserId: "user-1"
          })
        ];
      }
    }
  } as never);

  const fonts = await service.listPublicFonts("user-1");

  assert.deepEqual(
    fonts.map((font) => ({ id: font.id, ownerType: font.ownerType })),
    [
      { id: "font-admin", ownerType: "ADMIN" },
      { id: "font-user", ownerType: "USER" }
    ]
  );
  assert.deepEqual(findManyCalls[0], {
    where: {
      OR: [{ createdByUserId: null }, { createdByUserId: "user-1" }]
    },
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }]
  });
});

test("copybook font service protects private font files by owner", async () => {
  const service = new CopybookFontsService({
    copybookFont: {
      findUnique: async () =>
        fontRecord({
          id: "font-user",
          filename: "user.ttf",
          createdByAdminId: null,
          createdByUserId: "user-1"
        })
    }
  } as never);

  await assert.rejects(() => service.getLocalFontFile("user.ttf", "user-2"), /字体文件不存在/);
});

test("copybook font service keeps user fonts out of admin update and delete operations", async () => {
  const service = new CopybookFontsService({
    copybookFont: {
      findUnique: async () =>
        fontRecord({
          id: "font-user",
          createdByAdminId: null,
          createdByUserId: "user-1"
        }),
      update: async () => {
        throw new Error("不应更新用户字体");
      },
      delete: async () => {
        throw new Error("不应删除用户字体");
      }
    }
  } as never);

  await assert.rejects(() => service.updateFont("font-user", { name: "后台改名" }), /字体不存在/);
  await assert.rejects(() => service.deleteFont("font-user"), /字体不存在/);
});

test("copybook font service lets users delete only their own private fonts", async () => {
  const deletedIds: string[] = [];
  const service = new CopybookFontsService({
    copybookFont: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        fontRecord({
          id: where.id,
          filename: `${where.id}.ttf`,
          createdByAdminId: null,
          createdByUserId: where.id === "font-own" ? "user-1" : "user-2"
        }),
      delete: async ({ where }: { where: { id: string } }) => {
        deletedIds.push(where.id);

        return {};
      }
    }
  } as never);

  await service.deleteUserFont("user-1", "font-own");
  await assert.rejects(() => service.deleteUserFont("user-1", "font-other"), /字体不存在/);

  assert.deepEqual(deletedIds, ["font-own"]);
});

test("copybook font service accepts the name-label template for uploaded fonts", async () => {
  let updatedTemplates: unknown;
  const service = new CopybookFontsService({
    copybookFont: {
      findUnique: async () => fontRecord({}),
      update: async ({ data }: { data: { suitableTemplates?: unknown } }) => {
        updatedTemplates = data.suitableTemplates;

        return fontRecord({
          suitableTemplates: data.suitableTemplates,
        });
      },
    },
  } as never);

  const font = await service.updateFont("font-admin", {
    suitableTemplates: ["name-label"],
  });

  assert.deepEqual(updatedTemplates, ["name-label"]);
  assert.deepEqual(font.suitableTemplates, ["name-label"]);
});
