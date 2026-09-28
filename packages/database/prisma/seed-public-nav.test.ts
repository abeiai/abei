import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PUBLIC_NAV_ITEMS,
  LEGACY_DEFAULT_PUBLIC_NAV_ITEMS,
  migrateDefaultPublicNavItems
} from "./seed-public-nav.js";

test("旧默认前台菜单迁移为包含资源中心的新默认", () => {
  assert.equal(
    migrateDefaultPublicNavItems(LEGACY_DEFAULT_PUBLIC_NAV_ITEMS),
    DEFAULT_PUBLIC_NAV_ITEMS
  );
  assert.equal(
    migrateDefaultPublicNavItems(
      " 首页 | / \r\n 功能 | /features\n场景|/use-cases\n价格|/pricing\n文章|/articles\n用户中心|/dashboard "
    ),
    DEFAULT_PUBLIC_NAV_ITEMS
  );
});

test("管理员自定义前台菜单保持原值", () => {
  const customValue = "首页|/\n课程广场|/custom-center\n联系我们|/pages/contact";

  assert.equal(migrateDefaultPublicNavItems(customValue), customValue);
});

test("已迁移的新默认菜单保持不变", () => {
  assert.equal(
    migrateDefaultPublicNavItems(DEFAULT_PUBLIC_NAV_ITEMS),
    DEFAULT_PUBLIC_NAV_ITEMS
  );
});
