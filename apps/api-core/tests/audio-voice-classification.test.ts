import assert from "node:assert/strict";
import test from "node:test";

import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import {
  UpdateAdminVoiceAssetDto,
  UpdateSystemVoiceDto
} from "../src/audio/dto/audio.dto.js";
import { cosyVoiceSystemVoices } from "../src/audio/cosyvoice-system-voices.js";
import { minimaxSystemVoices } from "../src/audio/minimax-system-voices.js";

test("全部系统音色都具有四项分类、试听和特色头像", () => {
  const voices = [...cosyVoiceSystemVoices, ...minimaxSystemVoices];
  assert.equal(voices.length, 416);

  for (const voice of voices) {
    assert.ok(voice.language, `${voice.providerVoiceId} 缺少语种`);
    assert.ok(voice.accent, `${voice.providerVoiceId} 缺少口音`);
    assert.ok(voice.gender, `${voice.providerVoiceId} 缺少性别`);
    assert.ok(voice.ageCategory, `${voice.providerVoiceId} 缺少年龄分类`);
    assert.ok(voice.previewAudioUrl, `${voice.providerVoiceId} 缺少试听`);
    assert.ok(voice.avatarUrl, `${voice.providerVoiceId} 缺少头像`);
    assert.match(voice.avatarUrl, /-v6-/, `${voice.providerVoiceId} 未使用 GPT-Image 2 v6 头像`);
  }
});

test("后台音色分类字段可省略但语种性别年龄不能传 null", async () => {
  for (const Dto of [UpdateAdminVoiceAssetDto, UpdateSystemVoiceDto]) {
    for (const field of ["language", "gender", "ageCategory"]) {
      const errors = await validate(plainToInstance(Dto, { [field]: null }));
      assert.equal(errors.some((error) => error.property === field), true, `${Dto.name}.${field} 应拒绝 null`);
    }
    assert.deepEqual(await validate(plainToInstance(Dto, {})), []);
  }
});

test("后台音色口音允许用 null 清空", async () => {
  for (const Dto of [UpdateAdminVoiceAssetDto, UpdateSystemVoiceDto]) {
    assert.deepEqual(await validate(plainToInstance(Dto, { accent: null })), []);
  }
});
