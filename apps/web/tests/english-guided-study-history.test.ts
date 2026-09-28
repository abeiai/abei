import assert from "node:assert/strict";
import test from "node:test";

import type { EnglishGuidedStudyMaterial } from "../src/lib/english-guided-study-data";
import * as historyModule from "../src/lib/english-guided-study-history";

const firstMaterial = { id: "material-1" } as EnglishGuidedStudyMaterial;
const secondMaterial = { id: "material-2" } as EnglishGuidedStudyMaterial;

test("未登录用户始终得到 guest 空历史", () => {
  assert.equal(typeof historyModule.accountHistoryForUser, "function");
  assert.deepEqual(historyModule.accountHistoryForUser?.(null), {
    ownerUserId: null,
    status: "guest",
    items: [],
    errorMessage: null
  });
});

test("登录和切换账号时清空旧历史并进入 loading", () => {
  assert.deepEqual(historyModule.accountHistoryForUser?.("user-2"), {
    ownerUserId: "user-2",
    status: "loading",
    items: [],
    errorMessage: null
  });
});

test("陈旧账号请求不能覆盖当前账号历史", () => {
  const current = historyModule.accountHistoryForUser?.("user-2");
  assert.ok(current);
  assert.equal(historyModule.accountHistoryLoaded?.(current, "user-1", [firstMaterial]), current);
});

test("登录用户历史请求失败时保持 error 而不是 guest", () => {
  const loading = historyModule.accountHistoryForUser?.("user-1");
  assert.ok(loading);
  assert.equal(historyModule.accountHistoryFailed?.(loading, "user-1", "加载失败").status, "error");
});

test("制作台进入路由缓存后已发出的账号历史请求仍可完成", async () => {
  const loadAccountHistoryRequest = (
    historyModule as typeof historyModule & {
      loadAccountHistoryRequest?: (input: {
        isCurrent: () => boolean;
        load: () => Promise<EnglishGuidedStudyMaterial[]>;
        update: (updater: (current: historyModule.AccountHistoryState) => historyModule.AccountHistoryState) => void;
        userId: string;
      }) => Promise<void>;
    }
  ).loadAccountHistoryRequest;
  let state = historyModule.accountHistoryForUser("user-1");
  let resolveRequest: (items: EnglishGuidedStudyMaterial[]) => void = () => undefined;
  const pendingItems = new Promise<EnglishGuidedStudyMaterial[]>((resolve) => {
    resolveRequest = resolve;
  });

  assert.equal(typeof loadAccountHistoryRequest, "function");
  const request = loadAccountHistoryRequest?.({
    userId: "user-1",
    load: () => pendingItems,
    isCurrent: () => true,
    update: (updater) => {
      state = updater(state);
    }
  });

  resolveRequest([firstMaterial]);
  await request;
  assert.equal(state.status, "ready");
  assert.deepEqual(state.items, [firstMaterial]);
});

test("访客不能写入历史，登录用户可更新、置顶和移除内存历史", () => {
  const guest = historyModule.accountHistoryForUser?.(null);
  const loading = historyModule.accountHistoryForUser?.("user-1");
  assert.ok(guest && loading);

  const ready = historyModule.accountHistoryLoaded?.(loading, "user-1", [firstMaterial, secondMaterial]);
  assert.ok(ready);
  assert.deepEqual(historyModule.accountHistoryUpsert?.(guest, firstMaterial).items, []);
  assert.deepEqual(historyModule.accountHistoryPin?.(ready, secondMaterial.id).items, [secondMaterial, firstMaterial]);
  assert.deepEqual(historyModule.accountHistoryRemove?.(ready, firstMaterial.id).items, [secondMaterial]);
});

test("左栏历史最多保留最近五十条", () => {
  let state = historyModule.accountHistoryLoaded(
    historyModule.accountHistoryForUser("user-1"),
    "user-1",
    []
  );

  for (let index = 1; index <= 60; index += 1) {
    state = historyModule.accountHistoryUpsert(state, {
      id: `material-${index}`
    } as EnglishGuidedStudyMaterial);
  }

  assert.equal(state.items.length, 50);
  assert.equal(state.items[0]?.id, "material-60");
  assert.equal(state.items[49]?.id, "material-11");
});
