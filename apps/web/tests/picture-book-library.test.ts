import assert from "node:assert/strict";
import test from "node:test";
import { homepageLibrary } from "../src/lib/picture-book-library.js";
import { pictureBookPageImageSource } from "../src/lib/picture-book-images.js";
import { pictureBookPageAudioSource } from "../src/lib/picture-book-audio.js";

test("首页先显示8个专辑，再显示20本独立绘本，数量不足时如实展示", () => {
  const albums = Array.from({length:10},(_,id)=>({id:String(id),title:`专辑${id}`,coverUrl:"/cover.png",href:`/c/${id}`,bookCount:4}));
  const books = Array.from({length:25},(_,id)=>({id:String(id),title:`绘本${id}`,coverUrl:"/cover.png",href:`/library/${id}`,pageCount:4,hasAudio:false}));
  const display = homepageLibrary(albums,books);
  assert.deepEqual(display.albums.map(item=>item.id),["0","1","2","3","4","5","6","7"]);
  assert.deepEqual(display.books.map(item=>item.id),["0","1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19"]);
  assert.deepEqual(homepageLibrary([],[]),{albums:[],books:[]});
  assert.equal(homepageLibrary(albums.slice(0,1),books.slice(0,2)).books.length,2);
});

test("公开阅读的图片和音频始终走审核快照接口，包括原始相对路径", () => {
  assert.equal(pictureBookPageImageSource("book-1",0,"/picture-book-demos/lele-bear/cover.webp","public"),"/api/public/picture-books/book-1/pages/0/image?v=cover.webp");
  assert.equal(pictureBookPageAudioSource("book-1",1,"https://r.abeiai.com/audio/story.mp3","public"),"/api/public/picture-books/book-1/pages/1/audio?v=story.mp3");
});
