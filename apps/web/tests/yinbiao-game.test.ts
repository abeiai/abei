import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { containsSound, tokenizePhonetic } from "../src/lib/yinbiao/catalog";
type Entry = { word: string; phonetic: string; meaning: string };
function lookup(word: string): Entry {
  return JSON.parse(readFileSync(new URL(`../public/yinbiao/dictionary/${word[0]}.json`, import.meta.url), "utf8"))[word];
}
test("同音有词按发音而非拼写判定 farm 和错误词", () => {
  const farm = lookup("farm");
  assert.ok(containsSound(tokenizePhonetic(farm.phonetic), "ɑː"));
  assert.match(farm.meaning, /农/);
  assert.equal(containsSound(tokenizePhonetic(lookup("cat").phonetic), "ɑː"), false);
  assert.equal(containsSound(tokenizePhonetic(lookup("sheep").phonetic), "ɪ"), false);
  assert.equal(containsSound(tokenizePhonetic(lookup("ship").phonetic), "ɪ"), true);
});
test("长元音挑战至少有十个可输入的不同常见词", () => {
  for (const word of ["farm", "car", "park", "star", "art", "arm", "dark", "hard", "card", "start"]) {
    const entry = lookup(word);
    assert.ok(entry, word);
    assert.match(entry.meaning, /[\u4e00-\u9fff]/);
    assert.ok(containsSound(tokenizePhonetic(entry.phonetic), "ɑː"), `${word}: ${entry.phonetic}`);
  }
});
