import assert from "node:assert/strict";
import test from "node:test";
import { decodeStoryIdea, encodeStoryIdea, STORY_IDEA_MAX_LENGTH } from "../src/lib/storybook-idea";
import { normalizeSafeNextPath } from "../src/lib/profile-routing";

test("homepage story survives login validation with Chinese, newlines and special symbols", () => {
  const idea = "给 5 岁的孩子讲一个故事 🌙\n小熊 & 小兔，文件夹 C:\\故事，温暖的旁白。";
  const returnPath = `/storybook?${new URLSearchParams({ idea: encodeStoryIdea(idea) })}`;
  assert.equal(normalizeSafeNextPath(returnPath), returnPath);
  const loginHref = `/login?${new URLSearchParams({ next: returnPath })}`;
  const next = new URL(loginHref, "http://localhost:3600").searchParams.get("next")!;
  assert.equal(decodeStoryIdea(new URL(next, "http://localhost:3600").searchParams.get("idea")), idea);
});

test("maximum Chinese draft fits both the entry and nested login URL", () => {
  const idea = "绘".repeat(STORY_IDEA_MAX_LENGTH);
  const returnPath = `/storybook?${new URLSearchParams({ idea: encodeStoryIdea(idea) })}`;
  const loginHref = `/login?${new URLSearchParams({ next: returnPath })}`;
  assert.ok(loginHref.length < 8000);
  assert.equal(normalizeSafeNextPath(returnPath), returnPath);
  assert.equal(decodeStoryIdea(encodeStoryIdea(idea)), idea);
});

test("malformed, oversized and non-string encoded drafts are ignored", () => {
  for (const idea of [undefined, null, [], "!!!", "_w", "A".repeat(3000)]) {
    assert.equal(decodeStoryIdea(idea), "");
  }
  assert.equal(decodeStoryIdea(encodeStoryIdea("🌙小熊与小兔")), "🌙小熊与小兔");
});
