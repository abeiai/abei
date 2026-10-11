import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonsBooks } from "./seasons-series-data.mjs";
import { audioKey, bookId, buildSeasonsBookRecord, imageKey, validateSeasonsInventories, voiceId } from "./seasons-publication.mjs";

const images = JSON.parse(readFileSync(new URL("./seasons-generation-manifest.json", import.meta.url)));
const narration = JSON.parse(readFileSync(new URL("./seasons-narration-manifest.json", import.meta.url)));

test("四册36张封面及跨页与36段指定音色配音一一对应", () => {
  assert.doesNotThrow(() => validateSeasonsInventories(images, narration));
  const damaged = structuredClone(narration);
  damaged.entries[audioKey("spring", 1)].voiceId = "another-voice";
  assert.throws(() => validateSeasonsInventories(images, damaged), /音色|不匹配/);
  const repeated = structuredClone(images);
  repeated.entries[1].key = repeated.entries[2].key;
  assert.throws(() => validateSeasonsInventories(repeated, narration), /重复/);
});

test("作品记录固定为一张方形封面和八张连续2:1跨页", () => {
  for (const book of seasonsBooks) {
    const images = Array.from({ length: 9 }, (_, i) => `https://r.abeiai.com/${imageKey(book.slug, i)}.webp`);
    const audios = Array.from({ length: 9 }, (_, i) => `https://r.abeiai.com/${audioKey(book.slug, i)}.mp3`);
    const record = buildSeasonsBookRecord(book, images, audios);
    assert.equal(record.id, bookId(book.slug));
    assert.equal(record.style, "classic-oil");
    assert.equal(record.isSpread, true);
    assert.equal(record.pageCount, 8);
    assert.deepEqual(record.pages.map((page) => page.position), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(record.pages[0].narration, `阿禾的四季。${book.title}。`);
    assert.equal(record.pages[8].caption, book.spreads[7][0]);
    assert.equal(voiceId, "Chinese (Mandarin)_Warm_Girl");
  }
});
