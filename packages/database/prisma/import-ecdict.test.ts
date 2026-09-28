import assert from "node:assert/strict";
import test from "node:test";
import {
  dictionaryBoolean,
  dictionaryInteger,
  normalizeDictionaryWord,
  parseEcdictCsvRecord,
  parseEcdictCsvText,
  toDictionaryEntryCreateInput
} from "./import-ecdict.js";

test("parses ECDICT csv records with quoted commas and mapped fields", () => {
  const record = parseEcdictCsvRecord(
    '"test","test","n. a procedure, event, or situation","n. 测验; 检查","n/v","5","1","zk gk","120","234","p:tested/d:testing","{\\"source\\":\\"unit\\"}",""'
  );

  assert.deepEqual(record, {
    word: "test",
    phonetic: "test",
    definition: "n. a procedure, event, or situation",
    translation: "n. 测验; 检查",
    pos: "n/v",
    collins: "5",
    oxford: "1",
    tag: "zk gk",
    bnc: "120",
    frq: "234",
    exchange: "p:tested/d:testing",
    detail: '{"source":"unit"}',
    audio: ""
  });
});

test("parses multiline ECDICT csv text without merging following records", () => {
  const records = parseEcdictCsvText(`word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio
"ZZ Top","","a rock band
> quoted note
","乐队名","","","","","0","0","","",""
"zzz","","","int. 打鼾声","","","","","0","40687","","",""
`);

  assert.equal(records.length, 2);
  assert.equal(records[0]?.word, "ZZ Top");
  assert.match(records[0]?.definition ?? "", /quoted note/);
  assert.equal(records[1]?.word, "zzz");
  assert.equal(records[1]?.translation, "int. 打鼾声");
});

test("normalizes dictionary values before database import", () => {
  assert.equal(normalizeDictionaryWord("  Tests  "), "tests");
  assert.equal(dictionaryInteger("5"), 5);
  assert.equal(dictionaryInteger(""), null);
  assert.equal(dictionaryBoolean("1"), true);
  assert.equal(dictionaryBoolean(""), false);

  const input = toDictionaryEntryCreateInput({
    word: "Tests",
    phonetic: "",
    definition: "plural form of test",
    translation: "n. 测验",
    pos: "n",
    collins: "3",
    oxford: "",
    tag: "",
    bnc: "42",
    frq: "64",
    exchange: "",
    detail: "",
    audio: ""
  });

  assert.equal(input.word, "Tests");
  assert.equal(input.normalizedWord, "tests");
  assert.equal(input.phonetic, null);
  assert.equal(input.collins, 3);
  assert.equal(input.oxford, false);
  assert.equal(input.bnc, 42);
  assert.equal(input.frequency, 64);
});
