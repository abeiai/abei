import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { WechatAuthError } from "./wechat-mp.types.js";
export interface WechatMessageConfig {
  appId: string;
  token: string;
  encodingKey: string;
  originalId: string;
  messageMode: "plain" | "safe";
}
const xmlLimit = 65_536;
function formattingText(key: string, value: unknown) {
  return key === "#text" && typeof value === "string" && /^[\t\r\n ]*$/.test(value);
}
function flatXml(xml: string): Record<string, string> {
  if (
    Buffer.byteLength(xml) > xmlLimit ||
    /<!\s*(?:DOCTYPE|ENTITY)/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    throw new WechatAuthError("state");
  const value = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: false,
  }).parse(xml) as Record<string, unknown>;
  const root = value.xml;
  if (
    !root ||
    typeof root !== "object" ||
    Array.isArray(root) ||
    Object.entries(value).some(
      ([key, entry]) => key !== "xml" && key !== "?xml" && !formattingText(key, entry),
    )
  )
    throw new WechatAuthError("state");
  const entries = Object.entries(root).filter(
    ([key, entry]) => !formattingText(key, entry),
  );
  if (
    entries.length > 24 ||
    entries.some(
      ([key, value]) =>
        !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) ||
        typeof value !== "string" ||
        value.length > xmlLimit,
    )
  )
    throw new WechatAuthError("state");
  return Object.fromEntries(entries) as Record<string, string>;
}
function equal(left: string, right: string) {
  const a = Buffer.from(left),
    b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function sign(...values: string[]) {
  return createHash("sha1").update(values.sort().join("")).digest("hex");
}
function cdata(value: string) {
  return "<![CDATA[" + value.replaceAll("]]>", "]]]]><![CDATA[>") + "]]>";
}
export class WechatMessageCodec {
  constructor(
    private readonly config: WechatMessageConfig,
    private readonly clock = Date.now,
  ) {}
  private query(
    query: Record<string, string | undefined>,
    name: string,
    max = 128,
  ) {
    const value = query[name];
    if (typeof value !== "string" || !value || value.length > max)
      throw new WechatAuthError("state");
    return value;
  }
  private parameters(query: Record<string, string | undefined>) {
    const timestamp = this.query(query, "timestamp", 12),
      nonce = this.query(query, "nonce");
    if (
      !/^\d{10,12}$/.test(timestamp) ||
      Math.abs(Number(timestamp) - Math.floor(this.clock() / 1000)) > 300
    )
      throw new WechatAuthError("state");
    return { timestamp, nonce };
  }
  verify(query: Record<string, string | undefined>) {
    const { timestamp, nonce } = this.parameters(query);
    const signature = this.query(query, "signature", 40);
    if (
      !/^[a-f0-9]{40}$/.test(signature) ||
      !equal(signature, sign(this.config.token, timestamp, nonce))
    )
      throw new WechatAuthError("state");
    return this.query(query, "echostr", 1024);
  }
  decode(
    query: Record<string, string | undefined>,
    body: string,
  ): Record<string, string> {
    try {
      const { timestamp, nonce } = this.parameters(query);
      if (this.config.messageMode === "plain") {
        const signature = this.query(query, "signature", 40);
        if (
          !/^[a-f0-9]{40}$/.test(signature) ||
          !equal(signature, sign(this.config.token, timestamp, nonce))
        )
          throw new WechatAuthError("state");
        return this.validateMessage(flatXml(body));
      }
      const signature = this.query(query, "msg_signature", 40);
      const outer = flatXml(body),
        encrypted = outer.Encrypt;
      if (
        !encrypted ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(encrypted) ||
        !/^[a-f0-9]{40}$/.test(signature) ||
        !equal(signature, sign(this.config.token, timestamp, nonce, encrypted))
      )
        throw new WechatAuthError("state");
      const ciphertext = Buffer.from(encrypted, "base64"),
        key = Buffer.from(this.config.encodingKey + "=", "base64");
      if (
        key.length !== 32 ||
        !ciphertext.length ||
        ciphertext.length % 16 !== 0
      )
        throw new WechatAuthError("state");
      const decipher = createDecipheriv(
        "aes-256-cbc",
        key,
        key.subarray(0, 16),
      );
      decipher.setAutoPadding(false);
      const decoded = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      const padding = decoded.at(-1) ?? 0;
      if (
        padding < 1 ||
        padding > 32 ||
        decoded.length < 20 + padding ||
        !decoded.subarray(-padding).every((x) => x === padding)
      )
        throw new WechatAuthError("state");
      const payload = decoded.subarray(0, -padding),
        size = payload.readUInt32BE(16);
      if (size > xmlLimit || size < 1 || 20 + size > payload.length)
        throw new WechatAuthError("state");
      const utf8 = new TextDecoder("utf-8", { fatal: true });
      if (!equal(utf8.decode(payload.subarray(20 + size)), this.config.appId))
        throw new WechatAuthError("state");
      return this.validateMessage(
        flatXml(utf8.decode(payload.subarray(20, 20 + size))),
      );
    } catch {
      throw new WechatAuthError("state");
    }
  }
  private validateMessage(message: Record<string, string>) {
    if (
      message.ToUserName !== this.config.originalId ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(message.FromUserName ?? "") ||
      !/^\d{10,12}$/.test(message.CreateTime ?? "") ||
      Math.abs(Number(message.CreateTime) - Math.floor(this.clock() / 1000)) >
        300
    )
      throw new WechatAuthError("state");
    return message;
  }
  reply(recipient: string, text: string) {
    const timestamp = String(Math.floor(this.clock() / 1000)),
      nonce = randomBytes(16).toString("hex");
    const xml = `<xml><ToUserName>${cdata(recipient)}</ToUserName><FromUserName>${cdata(this.config.originalId)}</FromUserName><CreateTime>${timestamp}</CreateTime><MsgType><![CDATA[text]]></MsgType><Content>${cdata(text)}</Content></xml>`;
    if (this.config.messageMode === "plain") return xml;
    const length = Buffer.alloc(4);
    length.writeUInt32BE(Buffer.byteLength(xml));
    const raw = Buffer.concat([
        randomBytes(16),
        length,
        Buffer.from(xml),
        Buffer.from(this.config.appId),
      ]),
      padding = 32 - (raw.length % 32);
    const key = Buffer.from(this.config.encodingKey + "=", "base64"),
      cipher = createCipheriv("aes-256-cbc", key, key.subarray(0, 16));
    cipher.setAutoPadding(false);
    const encrypted = Buffer.concat([
      cipher.update(Buffer.concat([raw, Buffer.alloc(padding, padding)])),
      cipher.final(),
    ]).toString("base64");
    return `<xml><Encrypt>${cdata(encrypted)}</Encrypt><MsgSignature>${cdata(sign(this.config.token, timestamp, nonce, encrypted))}</MsgSignature><TimeStamp>${timestamp}</TimeStamp><Nonce>${cdata(nonce)}</Nonce></xml>`;
  }
}
