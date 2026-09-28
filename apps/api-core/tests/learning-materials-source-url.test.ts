import assert from "node:assert/strict";
import test from "node:test";

import { LearningMaterialsService } from "../src/learning-materials/learning-materials.service.js";

const sourceUrl =
  "https://basic.smartedu.cn/tchMaterial/detail?contentType=assets_document&contentId=5f380546-7207-4ac7-b3e0-1f66dc9fd575&catalogType=tchMaterial&subCatalog=tchMaterial";

function serviceFixture(value: string | null) {
  const textbook = {
    id: "textbook-1",
    slug: "smartedu-5f380546-7207-4ac7-b3e0-1f66dc9fd575",
    title: "道德与法治五年级上册",
    educationType: "PRIMARY" as const,
    subject: "道德与法治",
    version: "统编版",
    grade: "五年级",
    volume: "FIRST_VOLUME" as const,
    curriculumStandardYear: "2022",
    editionYear: null,
    publisher: null,
    coverUrl: null,
    sourceUrl: value,
    pdfUrl: null,
    pdfObjectKey: null,
    backupPdfUrl: null,
    backupPdfPath: null,
    markdownContent: null,
    markdownConversionStatus: "PENDING",
    markdownConvertedAt: null,
    markdownPageCount: null,
    mdUrl: null,
    mdObjectKey: null,
    sortOrder: 1,
    updatedAt: new Date("2026-08-09T00:00:00.000Z")
  };
  const prisma = {
    learningMaterialTextbook: {
      findFirst: async () => textbook
    }
  };
  const service = new LearningMaterialsService();

  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });

  return service;
}

test("公共教材详情返回 SmartEdu 来源地址", async () => {
  const textbook = await serviceFixture(sourceUrl).getPublicTextbook("textbook-1");

  assert.equal(textbook.sourceUrl, sourceUrl);
});

test("非 SmartEdu 教材返回空来源地址", async () => {
  const textbook = await serviceFixture(null).getPublicTextbook("textbook-1");

  assert.equal(textbook.sourceUrl, null);
});
