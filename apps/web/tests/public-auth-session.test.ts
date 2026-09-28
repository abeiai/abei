import assert from "node:assert/strict";
import test from "node:test";

import {
  publicAuthSessionOwner,
  publicAuthSessionStorageKey,
  shouldReloadForPublicAuthChange
} from "../src/lib/public-auth-session.js";
import {
  videoGuideLessonBelongsToUser,
  videoGuideLessonsForUser,
  videoGuideStorageKeyForUser,
  videoGuideStorageMatchesAuthOwner
} from "../src/lib/video-guide-data.js";

test("跨标签账号切换会使旧账号页面失效", () => {
  const firstUser = publicAuthSessionOwner("user-a");
  const secondUser = publicAuthSessionOwner("user-b");

  assert.equal(
    shouldReloadForPublicAuthChange(
      "user-a",
      publicAuthSessionStorageKey,
      secondUser
    ),
    true
  );
  assert.equal(
    shouldReloadForPublicAuthChange(
      "user-a",
      publicAuthSessionStorageKey,
      firstUser
    ),
    false
  );
  assert.equal(shouldReloadForPublicAuthChange("user-a", "other-key", secondUser), false);
});

test("账号切换后延迟返回的数据不能写入旧账号视频导学缓存", async () => {
  const firstUserStorageKey = videoGuideStorageKeyForUser("user-a");
  let resolveResponse:
    | ((lessons: Array<{ id: string; userId: string }>) => void)
    | undefined;
  const delayedResponse = new Promise<Array<{ id: string; userId: string }>>(
    (resolve) => {
      resolveResponse = resolve;
    }
  );
  const acceptedResponse = delayedResponse.then((lessons) =>
    videoGuideLessonsForUser(lessons, "user-a")
  );

  resolveResponse?.([{ id: "lesson-from-user-b", userId: "user-b" }]);
  const acceptedLessons = await acceptedResponse;
  const activeOwner = publicAuthSessionOwner("user-b");

  assert.deepEqual(acceptedLessons, []);
  assert.equal(videoGuideStorageMatchesAuthOwner(firstUserStorageKey, activeOwner), false);
  assert.equal(videoGuideLessonBelongsToUser("user-b", "user-a"), false);
  assert.equal(
    videoGuideStorageMatchesAuthOwner(
      videoGuideStorageKeyForUser("user-b"),
      activeOwner
    ),
    true
  );
});

test("游客和登录用户使用不同身份标记", () => {
  assert.notEqual(publicAuthSessionOwner(null), publicAuthSessionOwner("user-a"));
  assert.equal(
    shouldReloadForPublicAuthChange(
      null,
      publicAuthSessionStorageKey,
      publicAuthSessionOwner("user-a")
    ),
    true
  );
});
