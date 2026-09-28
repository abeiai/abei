import assert from "node:assert/strict";
import test from "node:test";

test("公开教材 sitemap 接口只返回轻量 SEO 字段", async () => {
  const { PublicLearningMaterialsController } = await import(
    "../src/learning-materials/public-learning-materials.controller"
  );
  const rows = [
    {
      slug: "textbook-1",
      updatedAt: new Date("2026-08-07T00:00:00.000Z")
    }
  ];
  const service = {
    listPublicTextbookSitemapEntries: async () => rows
  };
  const controller = new PublicLearningMaterialsController(service as never);

  assert.deepEqual(await controller.listTextbookSitemapEntries(), {
    code: 0,
    message: "成功",
    data: rows
  });
});
