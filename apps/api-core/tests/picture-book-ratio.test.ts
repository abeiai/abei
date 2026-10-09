import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { validateSync } from "class-validator";
import { CreatePictureBookDto, UpdatePictureBookDto } from "../src/picture-books/picture-book.dto.js";
import { pictureBookAspectRatios, pictureBookImageSize } from "../src/picture-books/picture-book-ratio.js";

test("all ten picture book ratios are accepted in the requested order", () => {
  assert.deepEqual(pictureBookAspectRatios, ["21:10", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"]);
  for (const aspectRatio of pictureBookAspectRatios) {
    const create = Object.assign(new CreatePictureBookDto(), { brief: "森林冒险", style: "温暖水彩", pageCount: 8, aspectRatio });
    const update = Object.assign(new UpdatePictureBookDto(), { aspectRatio });
    assert.equal(validateSync(create).length, 0, aspectRatio);
    assert.equal(validateSync(update).length, 0, aspectRatio);
  }
  assert.equal(validateSync(Object.assign(new UpdatePictureBookDto(), { aspectRatio: "21:9" }))[0]?.property, "aspectRatio");
  assert.equal(validateSync(Object.assign(new CreatePictureBookDto(), { brief: "森林冒险", style: "温暖水彩", pageCount: 8 })).length, 0);
});

test("generation dimensions preserve the requested ratio within both providers' limits", () => {
  for (const ratio of pictureBookAspectRatios) {
    const [widthRatio, heightRatio] = ratio.split(":").map(Number) as [number, number];
    const { width, height } = pictureBookImageSize(ratio);
    assert.equal(width * heightRatio, height * widthRatio, ratio);
    for (const edge of [width, height]) {
      assert.ok(edge >= 512 && edge <= 2048, ratio);
      assert.equal(edge % 16, 0, ratio);
    }
  }
  assert.deepEqual(pictureBookImageSize("1:1"), { width: 1024, height: 1024 });
  assert.deepEqual(pictureBookImageSize("unknown"), pictureBookImageSize("1:1"));
});
