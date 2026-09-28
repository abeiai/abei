import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import voiceCopyModule from "../../../scripts/audio/platform-designed-voice-copy.js";
import { platformDesignedAvatarAtlases, platformDesignedAvatarSourceSha256 } from "./platform-designed-avatar-plan.js";

const { platformDesignedVoiceCopy } = voiceCopyModule;

test("头像拼图中的 31 个位置与平台设计音色一一对应", () => {
  assert.deepEqual(platformDesignedAvatarAtlases.map((group) => group.length), [8, 8, 8, 7]);
  const ids = platformDesignedAvatarAtlases.flat();
  assert.equal(new Set(ids).size, 31);
  assert.deepEqual([...ids].sort(), Object.keys(platformDesignedVoiceCopy).sort());
  assert.equal(platformDesignedAvatarSourceSha256.length, platformDesignedAvatarAtlases.length);
  assert.equal(new Set(platformDesignedAvatarSourceSha256).size, 4);
  for (const [index, hash] of platformDesignedAvatarSourceSha256.entries()) {
    assert.match(hash, /^[a-f0-9]{64}$/);
    const letter = String.fromCharCode(97 + index);
    const source = readFileSync(new URL(`../../../scripts/audio/assets/platform-designed-avatar-atlas-${letter}.png`, import.meta.url));
    assert.equal(createHash("sha256").update(source).digest("hex"), hash);
  }
});
