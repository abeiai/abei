import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash } from "node:crypto";
import test from "node:test";
import { WechatMessageCodec } from "../src/auth/wechat-mp-message.js";
const key = Buffer.from("0123456789abcdef0123456789abcdef");
const config = {
  appId: "wx0123456789abcdef",
  token: "unit-callback-token",
  encodingKey: key.toString("base64").slice(0, -1),
  originalId: "gh_unit_test",
  messageMode: "safe" as const,
};
const now = 1_800_000_000_000;
const timestamp = "1800000000";
function signature(...values: string[]) {
  return createHash("sha1").update(values.sort().join("")).digest("hex");
}
function encrypted(xml: string, appId = config.appId) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(Buffer.byteLength(xml));
  const payload = Buffer.concat([
    Buffer.alloc(16, 7),
    length,
    Buffer.from(xml),
    Buffer.from(appId),
  ]);
  const pad = 32 - (payload.length % 32);
  const cipher = createCipheriv("aes-256-cbc", key, key.subarray(0, 16));
  cipher.setAutoPadding(false);
  return Buffer.concat([
    cipher.update(Buffer.concat([payload, Buffer.alloc(pad, pad)])),
    cipher.final(),
  ]).toString("base64");
}
function fixture(xml: string, appId?: string) {
  const encrypt = encrypted(xml, appId);
  return {
    body: `<xml><ToUserName><![CDATA[gh_unit_test]]></ToUserName><Encrypt><![CDATA[${encrypt}]]></Encrypt></xml>`,
    query: {
      timestamp,
      nonce: "unit-nonce",
      msg_signature: signature(config.token, timestamp, "unit-nonce", encrypt),
    },
  };
}
const event = `<xml><ToUserName><![CDATA[gh_unit_test]]></ToUserName><FromUserName><![CDATA[verified-openid]]></FromUserName><CreateTime>1800000000</CreateTime><MsgType><![CDATA[event]]></MsgType><Event><![CDATA[subscribe]]></Event><EventKey><![CDATA[qrscene_ABEI2_L_0123456789abcdef0123456789abcdef]]></EventKey></xml>`;
test("微信格式化 XML 的字段间和文档空白在明文与安全模式均可解析", () => {
  const format = (xml: string) => "\r\n" + xml
    .replace("<xml>", "<xml>\r\n  ")
    .replace(/(<\/[A-Za-z]+>)(?=<)/g, "$1\r\n  ") + "\r\n";
  const formatted = format(event);
  const plain = new WechatMessageCodec({ ...config, messageMode: "plain" }, () => now);
  const query = {
    timestamp,
    nonce: "formatted",
    signature: signature(config.token, timestamp, "formatted"),
  };
  assert.equal(plain.decode(query, formatted).FromUserName, "verified-openid");
  const safe = fixture(formatted);
  assert.equal(
    new WechatMessageCodec(config, () => now).decode(
      safe.query,
      format(safe.body),
    ).FromUserName,
    "verified-openid",
  );
});
test("允许格式空白不放宽身份值或非空白混合文本校验", () => {
  const plain = new WechatMessageCodec({ ...config, messageMode: "plain" }, () => now);
  const query = {
    timestamp,
    nonce: "invalid-text",
    signature: signature(config.token, timestamp, "invalid-text"),
  };
  for (const xml of [
    event.replace("verified-openid", " verified-openid "),
    event.replace("</xml>", "unexpected text</xml>"),
  ]) {
    assert.throws(() => plain.decode(query, xml));
    const safe = fixture(xml);
    assert.throws(() => new WechatMessageCodec(config, () => now).decode(safe.query, safe.body));
  }
});
test("安全模式验签解密获得正文身份，而不信任查询 OpenID", () => {
  const input = fixture(event);
  const message = new WechatMessageCodec(config, () => now).decode(
    { ...input.query, openid: "forged-openid" },
    input.body,
  );
  assert.equal(message.FromUserName, "verified-openid");
  assert.equal(message.Event, "subscribe");
});
test("明文模式验签后读取扫码事件，并拒绝坏签名与错误接收方", () => {
  const codec = new WechatMessageCodec({ ...config, messageMode: "plain" }, () => now);
  const query = {
    timestamp,
    nonce: "plain-nonce",
    signature: signature(config.token, timestamp, "plain-nonce"),
  };
  assert.equal(
    codec.decode({ ...query, openid: "forged-openid" }, event).FromUserName,
    "verified-openid",
  );
  for (const input of [
    { query: { ...query, signature: "0".repeat(40) }, body: event },
    { query, body: event.replace("gh_unit_test", "gh_other") },
    { query: { ...query, timestamp: "1799999000" }, body: event },
    { query, body: fixture(event).body },
  ]) assert.throws(() => codec.decode(input.query, input.body));
  assert.throws(() => new WechatMessageCodec(config, () => now).decode(query, event));
});
test("明文模式被动回复包含经 XML 转义的正文", () => {
  const response = new WechatMessageCodec(
    { ...config, messageMode: "plain" },
    () => now,
  ).reply("verified-openid", "扫码成功 & 请返回网页");
  assert.match(response, /<ToUserName><!\[CDATA\[verified-openid\]\]><\/ToUserName>/);
  assert.match(response, /扫码成功 & 请返回网页/);
  assert.doesNotMatch(response, /<Encrypt>/);
});
test("坏签名、其他 AppID、其他接收公众号、过期时间和明文均拒绝", () => {
  const codec = new WechatMessageCodec(config, () => now);
  const good = fixture(event);
  for (const input of [
    { ...good, query: { ...good.query, msg_signature: "0".repeat(40) } },
    fixture(event, "wx_other_app"),
    fixture(event.replace("gh_unit_test", "gh_other")),
    { ...good, query: { ...good.query, timestamp: "1799999000" } },
    { ...good, body: event },
  ])
    assert.throws(() => codec.decode(input.query, input.body));
});
test("GET URL 验证也必须验签且只返回验证过的 echostr", () => {
  const codec = new WechatMessageCodec(config, () => now);
  assert.equal(
    codec.verify({
      timestamp,
      nonce: "verify",
      echostr: "verified-echo",
      signature: signature(config.token, timestamp, "verify"),
    }),
    "verified-echo",
  );
  assert.throws(() =>
    codec.verify({
      timestamp,
      nonce: "verify",
      echostr: "forged",
      signature: "0".repeat(40),
    }),
  );
});
test("外部实体、嵌套字段和重复身份字段失败关闭", () => {
  const codec = new WechatMessageCodec(config, () => now);
  for (const xml of [
    '<!DOCTYPE xml [<!ENTITY ex SYSTEM "file:///private/data">]>' + event,
    event
      .replace("verified-openid", "<nested>openid</nested>")
      .replace(
        "<![CDATA[<nested>openid</nested>]]>",
        "<nested>openid</nested>",
      ),
    event.replace("</xml>", "<FromUserName>second-user</FromUserName></xml>"),
  ]) {
    const input = fixture(xml);
    assert.throws(() => codec.decode(input.query, input.body));
  }
});
test("被动回复用安全模式加密并保留中文和 XML 转义内容", () => {
  const response = new WechatMessageCodec(config, () => now).reply(
    "verified-openid",
    "请回复登录确认码，内容 </xml> & 正常",
  );
  const encrypt = response.match(
    /<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/,
  )?.[1];
  assert.ok(encrypt);
  const decipher = createDecipheriv("aes-256-cbc", key, key.subarray(0, 16));
  decipher.setAutoPadding(false);
  const decoded = Buffer.concat([
    decipher.update(Buffer.from(encrypt, "base64")),
    decipher.final(),
  ]);
  const size = decoded.readUInt32BE(16);
  const xml = decoded.subarray(20, 20 + size).toString("utf8");
  assert.match(xml, /verified-openid/);
  assert.match(xml, /请回复登录确认码/);
  assert.doesNotMatch(response, /verified-openid|请回复登录确认码/);
});
