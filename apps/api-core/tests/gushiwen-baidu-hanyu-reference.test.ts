import assert from "node:assert/strict";
import test from "node:test";

import { fetchBaiduHanyuGushiwenReference } from "../src/english-guided-study/gushiwen-baidu-hanyu-reference.js";

const sid = "b9a28df1a8254ff2bebced74c5d5c9cd";

function searchHtml(author = "王湾") {
  const value = JSON.stringify({
    ret_array: [{
      body: ["客路青山外，行舟绿水前。潮平两岸阔，风正一帆悬。"],
      literature_author: [{
        basic_description: ["王湾是唐代诗人，曾往来吴楚之间。"],
        display_name: [author]
      }],
      name: [{ "@value": "次北固山下" }],
      sid: [sid]
    }]
  });
  return `<textarea id="j_poem-body-content-value">${value}</textarea>`;
}

function detailResponse() {
  return {
    data: {
      author: "王湾",
      background: "诗人在冬末春初行舟至北固山下，眼前景色触发了思乡之情。",
      dynasty: "唐",
      explain: ["这首诗描写江南冬末春初的景色，并抒发思乡之情。"],
      means: "旅途在青山之外，诗人乘船行在绿水之前。",
      name: "次北固山下",
      poemLines: [{
        name: "客路青山外",
        pinyin: "kè lù qīng shān wài",
        punc: "，",
        translate: "旅途在青山之外，",
        zhushiKvList: [{ source: "客路", zhushi: "旅途。" }]
      }],
      shangxi: [{ text: "诗中景物开阔，末尾借归雁寄托乡思。" }]
    }
  };
}

test("无用户参考资料时可生成百度汉语拼音、译文、注释和背景参考", async () => {
  const requestedUrls: string[] = [];
  const fetcher = (async (input: URL | RequestInfo) => {
    const url = String(input);
    requestedUrls.push(url);
    return url.startsWith("https://hanyu.baidu.com/s?")
      ? new Response(searchHtml(), { status: 200 })
      : Response.json(detailResponse());
  }) as typeof fetch;

  const material = await fetchBaiduHanyuGushiwenReference({
    author: "王湾",
    fetcher,
    sourceText: "客路青山外，行舟绿水前。潮平两岸阔，风正一帆悬。",
    title: "次北固山下"
  });

  assert.equal(material?.name, "百度汉语《次北固山下》");
  assert.match(material?.content ?? "", /拼音：kè lù qīng shān wài/);
  assert.match(material?.content ?? "", /译文：旅途在青山之外/);
  assert.match(material?.content ?? "", /客路：旅途/);
  assert.match(material?.content ?? "", /创作背景/);
  assert.match(material?.content ?? "", /作者介绍/);
  assert.equal(requestedUrls.length, 2);
  assert.match(requestedUrls[0] ?? "", /wd=%E6%AC%A1%E5%8C%97%E5%9B%BA%E5%B1%B1%E4%B8%8B/);
  assert.doesNotMatch(requestedUrls.join("\n"), /user_info|userid/);
});

test("作者与原文都不能确认对应作品时不使用百度搜索结果", async () => {
  let requestCount = 0;
  const fetcher = (async () => {
    requestCount += 1;
    return new Response(searchHtml("李白"), { status: 200 });
  }) as typeof fetch;

  const material = await fetchBaiduHanyuGushiwenReference({
    author: "王湾",
    fetcher,
    sourceText: "完全不同的古诗文内容",
    title: "次北固山下"
  });

  assert.equal(material, null);
  assert.equal(requestCount, 1);
});

test("没有标题时使用原文首句检索并通过原文确认作品", async () => {
  let searchUrl = "";
  const fetcher = (async (input: URL | RequestInfo) => {
    const url = String(input);
    if (url.startsWith("https://hanyu.baidu.com/s?")) {
      searchUrl = url;
      return new Response(searchHtml(), { status: 200 });
    }
    return Response.json(detailResponse());
  }) as typeof fetch;

  const material = await fetchBaiduHanyuGushiwenReference({
    author: null,
    fetcher,
    sourceText: "客路青山外，行舟绿水前。潮平两岸阔，风正一帆悬。",
    title: ""
  });

  assert.ok(material);
  assert.match(searchUrl, /wd=%E5%AE%A2%E8%B7%AF%E9%9D%92%E5%B1%B1%E5%A4%96%E8%A1%8C%E8%88%9F%E7%BB%BF%E6%B0%B4%E5%89%8D/);
});
