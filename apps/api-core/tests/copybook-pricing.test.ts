import { membershipWalletFixture } from "./helpers/membership-wallet-fixture.js";
import assert from "node:assert/strict";
import test from "node:test";

import { calculateCopybookPricing } from "../src/copybooks/copybook-pricing.js";
import { CopybooksService } from "../src/copybooks/copybooks.service.js";
import { WalletController } from "../src/wallet/wallet.controller.js";
import { copybookGenerateCreditValue, WalletService } from "../src/wallet/wallet.service.js";

test("无水印字帖按每页 2 点计算", () => {
  assert.deepEqual(calculateCopybookPricing(copybookLayout(1)), {
    pageCount: 1,
    hasWatermark: false,
    creditsPerPage: 2,
    credits: 2
  });
  assert.deepEqual(calculateCopybookPricing(copybookLayout(10)), {
    pageCount: 10,
    hasWatermark: false,
    creditsPerPage: 2,
    credits: 20
  });
});

test("任意页面有有效水印时整份字帖按每页 5 点计算", () => {
  const layout = copybookLayout(10);
  const pages = layout.pages as Array<Record<string, unknown>>;

  pages[5] = {
    ...pages[5],
    watermark: {
      text: {
        visible: true,
        value: "学乐AI"
      }
    }
  };

  assert.deepEqual(calculateCopybookPricing(layout), {
    pageCount: 10,
    hasWatermark: true,
    creditsPerPage: 5,
    credits: 50
  });
});

test("空文本或不可见水印不按带水印字帖收费", () => {
  const layout = copybookLayout(2);
  const pages = layout.pages as Array<Record<string, unknown>>;

  pages[0] = {
    ...pages[0],
    watermark: {
      text: {
        visible: true,
        value: "   "
      },
      image: {
        visible: false,
        src: ""
      }
    }
  };

  assert.deepEqual(calculateCopybookPricing(layout), {
    pageCount: 2,
    hasWatermark: false,
    creditsPerPage: 2,
    credits: 4
  });
});

test("姓名贴活动期间服务端按 0 点计算", () => {
  assert.deepEqual(calculateCopybookPricing(nameLabelLayout(1), "name-label"), {
    pageCount: 1,
    hasWatermark: false,
    creditsPerPage: 0,
    credits: 0
  });
});

test("伪造姓名贴、混合普通页面或叠加水印时不享受免费活动", () => {
  const missingSheet = copybookLayout(1);
  const watermarked = nameLabelLayout(1);
  const mixed = nameLabelLayout(2);

  (watermarked.pages as Array<Record<string, unknown>>)[0].watermark = {
    text: { visible: true, value: "免费" }
  };
  (mixed.pages as Array<Record<string, unknown>>)[1].nameLabelSheet = null;

  assert.equal(calculateCopybookPricing(missingSheet, "name-label").credits, 2);
  assert.equal(calculateCopybookPricing(watermarked, "name-label").credits, 5);
  assert.equal(calculateCopybookPricing(mixed, "name-label").credits, 4);
});

test("姓名贴生成记录 0 点且不调用钱包扣费", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    endpoint: process.env.S3_ENDPOINT,
    bucket: process.env.S3_BUCKET,
    accessKey: process.env.S3_ACCESS_KEY_ID,
    secret: process.env.S3_SECRET_ACCESS_KEY
  };
  process.env.S3_ENDPOINT = "https://r2.example.com";
  process.env.S3_BUCKET = "copybooks";
  process.env.S3_ACCESS_KEY_ID = "test-access";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret";
  globalThis.fetch = async () => new Response(null, { status: 200 });

  let consumeCount = 0;
  let createdCredits: unknown = null;
  const wallet = {
    availableCredits: 0,
    frozenCredits: 0,
    totalTopUpCredits: 0,
    totalConsumedCredits: 0
  };
  const service = new CopybooksService(
    { renderPdf: async () => Buffer.from("pdf") } as never,
    {
      getWallet: async () => wallet,
      consumeCopybookGenerateCreditsInTransaction: async () => {
        consumeCount += 1;
        return { credits: 2, wallet };
      }
    } as never
  );
  Object.defineProperty(service, "prisma", {
    value: {
      ...membershipWalletFixture(),
      wallet: { findUnique: async () => ({ availableCredits: 100 }) },
      $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
        copybookRecord: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            createdCredits = data.credits;
            return { id: "copybook-name-label-1", createdAt: new Date(), ...data };
          }
        }
      })
    }
  });

  try {
    const result = await service.generate(
      { userId: "user-1", mode: "ACCOUNT", learnerId: null },
      {
        content: "姓名：张三",
        layout: nameLabelLayout(1),
        templateId: "name-label",
        templateName: "姓名贴"
      }
    );

    assert.equal(result.credits, 0);
    assert.equal(createdCredits, 0);
    assert.equal(consumeCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("S3_ENDPOINT", originalEnv.endpoint);
    restoreEnv("S3_BUCKET", originalEnv.bucket);
    restoreEnv("S3_ACCESS_KEY_ID", originalEnv.accessKey);
    restoreEnv("S3_SECRET_ACCESS_KEY", originalEnv.secret);
  }
});

test("钱包接受按页计算的多页扣点并拒绝超出最大值", () => {
  assert.equal(copybookGenerateCreditValue(20), 20);
  assert.equal(copybookGenerateCreditValue(50), 50);
  assert.throws(() => copybookGenerateCreditValue(0), /请重新确认本次生成字帖的点数消耗/);
  assert.throws(() => copybookGenerateCreditValue(501), /请重新确认本次生成字帖的点数消耗/);
});

test("字帖扣费只能由生成服务调用，不暴露独立钱包扣费接口", () => {
  assert.equal("consumeCopybookGenerateCredits" in WalletController.prototype, false);
  assert.equal("consumeCopybookGenerateCredits" in WalletService.prototype, false);
});

test("相同幂等键的既有流水金额与本次费用不一致时拒绝复用", async () => {
  const walletService = Object.create(WalletService.prototype) as WalletService;
  const transaction = {
    ledgerEntry: {
      async findUnique() {
        return {
          id: "ledger-1",
          userId: "user-1",
          type: "CONSUME",
          amount: -2,
          balanceAfter: 98,
          relatedTaskType: "COPYBOOK",
          note: "字帖生成消耗 2 点",
          createdAt: new Date()
        };
      }
    },
    ...membershipWalletFixture(),
    wallet: {
      async upsert() {
        return {};
      },
      async findUniqueOrThrow() {
        throw new Error("金额冲突时不应读取并返回钱包");
      }
    }
  };

  await assert.rejects(
    () =>
      walletService.consumeCopybookGenerateCreditsInTransaction(
        transaction as never,
        "user-1",
        "copybook-record-1",
        50
      ),
    /该次字帖生成请求的扣费金额不一致/
  );
});

test("每个新字帖记录使用独立的扣费幂等键", async () => {
  const walletService = Object.create(WalletService.prototype) as WalletService;
  const idempotencyKeys: string[] = [];
  const wallet = {
    id: "wallet-1",
    userId: "user-1",
    availableCredits: 98,
    frozenCredits: 0,
    totalTopUpCredits: 100,
    totalConsumedCredits: 2,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  const transaction = {
    ledgerEntry: {
      async findUnique() {
        return null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        idempotencyKeys.push(String(data.idempotencyKey));

        return {
          id: `ledger-${idempotencyKeys.length}`,
          ...data,
          createdAt: new Date()
        };
      }
    },
    ...membershipWalletFixture(),
    $queryRaw: async () => [],
    wallet: {
      async update({data}: {data: {availableCredits?: {increment?: number; decrement?: number}; frozenCredits?: {increment?: number; decrement?: number}; totalConsumedCredits?: {increment?: number}}}) {
        wallet.availableCredits += (data.availableCredits?.increment ?? 0) - (data.availableCredits?.decrement ?? 0);
        wallet.frozenCredits += (data.frozenCredits?.increment ?? 0) - (data.frozenCredits?.decrement ?? 0);
        wallet.totalConsumedCredits += data.totalConsumedCredits?.increment ?? 0;
        return wallet;
      },
      async upsert() {
        return wallet;
      },
      async updateMany() {
        return { count: 1 };
      },
      async findUniqueOrThrow() {
        return wallet;
      }
    }
  };

  await walletService.consumeCopybookGenerateCreditsInTransaction(
    transaction as never,
    "user-1",
    "copybook-record-1",
    2
  );
  await walletService.consumeCopybookGenerateCreditsInTransaction(
    transaction as never,
    "user-1",
    "copybook-record-2",
    2
  );

  assert.deepEqual(idempotencyKeys, [
    "copybook-generate:user-1:copybook-record-1",
    "copybook-generate:user-1:copybook-record-2"
  ]);
});

test("服务端忽略客户端伪造的低点数并在渲染前检查真实费用", async () => {
  process.env.DATABASE_URL ??= "postgresql://xueleai:xueleai_dev_password@localhost:3324/xueleai?schema=public";
  let renderCount = 0;
  const service = new CopybooksService(
    {
      async renderPdf() {
        renderCount += 1;
        throw new Error("余额不足时不应开始渲染");
      }
    } as never,
    {} as never
  );

  (service as unknown as { prisma: unknown }).prisma = {
    ...membershipWalletFixture(),
    wallet: {
      async findUnique() {
        return {
          availableCredits: 3
        };
      }
    }
  };

  await assert.rejects(
    () =>
      service.generate({ userId: "user-1", mode: "ACCOUNT", learnerId: null }, {
        credits: 2,
        layout: copybookLayout(2)
      }),
    (error: unknown) => error instanceof Error && error.message === "点数余额不足，请先充值"
  );
  assert.equal(renderCount, 0);
});

function copybookLayout(count: number) {
  return {
    pages: Array.from({ length: count }, () => ({
      page: {
        width: 595,
        height: 842,
        margin: 40
      },
      grid: {
        type: "fang",
        cell: 48,
        cellWidth: 48,
        cellHeight: 48,
        rowGap: 0,
        rows: 1,
        cols: 10,
        x: 40,
        y: 80
      },
      content: [],
      style: {
        strokeColor: "#2F8F6B",
        guideColor: "#BFE7D2",
        textColor: "#EF1D28",
        traceColor: "#FFB6BD",
        font: "serif",
        fontSize: 24
      }
    }))
  };
}

function nameLabelLayout(count: number) {
  const layout = copybookLayout(count);

  for (const page of layout.pages as Array<Record<string, unknown>>) {
    page.grid = {
      ...(page.grid as Record<string, unknown>),
      visible: false
    };
    page.nameLabelSheet = {
      x: 40,
      y: 40,
      labelWidth: 200,
      labelHeight: 100,
      rows: 1,
      columns: 1,
      labels: [{ lines: ["姓名：张三"] }]
    };
  }

  return layout;
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
