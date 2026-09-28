import { HttpStatus, Injectable } from "@nestjs/common";
import { decryptSecret, encryptSecret, getPrismaClient, maskSecret } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import { UpdatePaymentConfigDto } from "./dto/update-payment-config.dto.js";
import { isValidRsaPrivateKey, isValidRsaPublicKey } from "./payment-crypto.js";
import { paymentProductName, paymentSceneName } from "./payment-scene.js";
import type { PaymentProduct, PaymentProvider, PaymentScene } from "./payment-channel.types.js";

const paymentConfigDefinitions = [
  {
    key: "paymentAlipayEnabled",
    label: "支付宝启用",
    value: "false",
    description: "正式启用后，前台才展示支付宝支付方式。",
    sortOrder: 410
  },
  {
    key: "paymentAlipayAppId",
    label: "支付宝 AppID",
    value: "",
    description: "支付宝开放平台应用 AppID。",
    sortOrder: 411
  },
  {
    key: "paymentAlipayEnvironment",
    label: "支付宝环境",
    value: "production",
    description: "正式环境使用支付宝正式网关，沙箱环境使用支付宝沙箱网关。",
    sortOrder: 411
  },
  {
    key: "paymentAlipayPrivateKeyEncrypted",
    label: "支付宝应用私钥",
    value: "",
    description: "用于请求签名的应用私钥，入库前会加密。",
    sortOrder: 412
  },
  {
    key: "paymentAlipayPublicKeyEncrypted",
    label: "支付宝公钥",
    value: "",
    description: "用于回调验签的支付宝公钥，入库前会加密。",
    sortOrder: 413
  },
  {
    key: "paymentAlipayNotifyUrl",
    label: "支付宝异步通知地址",
    value: "",
    description: "支付宝服务器异步回调地址。",
    sortOrder: 414
  },
  {
    key: "paymentAlipayReturnUrl",
    label: "支付宝同步返回地址",
    value: "",
    description: "用户支付完成后的浏览器跳转地址，可选。",
    sortOrder: 415
  },
  {
    key: "paymentAlipayPageEnabled",
    label: "支付宝扫码支付（PC）",
    value: "true",
    description: "在 PC 浏览器中展示支付宝预创建交易二维码，扫码后进入付款确认。",
    sortOrder: 416
  },
  {
    key: "paymentAlipayWapEnabled",
    label: "支付宝手机网站支付",
    value: "true",
    description: "在手机浏览器中启用支付宝手机网站支付。",
    sortOrder: 417
  },
  {
    key: "paymentWechatEnabled",
    label: "微信支付启用",
    value: "false",
    description: "正式启用后，前台才展示微信支付方式。",
    sortOrder: 420
  },
  {
    key: "paymentWechatAppId",
    label: "微信支付 AppID",
    value: "",
    description: "商户号绑定的 AppID。",
    sortOrder: 421
  },
  {
    key: "paymentWechatMerchantId",
    label: "微信支付商户号",
    value: "",
    description: "微信支付商户号。",
    sortOrder: 422
  },
  {
    key: "paymentWechatApiV3KeyEncrypted",
    label: "微信支付 APIv3 密钥",
    value: "",
    description: "用于解密支付通知资源的 APIv3 密钥，入库前会加密。",
    sortOrder: 423
  },
  {
    key: "paymentWechatMerchantPrivateKeyEncrypted",
    label: "微信支付商户 API 私钥",
    value: "",
    description: "用于请求签名的商户 API 私钥，入库前会加密。",
    sortOrder: 424
  },
  {
    key: "paymentWechatMerchantSerialNo",
    label: "微信支付商户证书序列号",
    value: "",
    description: "请求签名所用商户 API 证书序列号。",
    sortOrder: 425
  },
  {
    key: "paymentWechatNotifyUrl",
    label: "微信支付通知地址",
    value: "",
    description: "微信支付通知回调地址。",
    sortOrder: 426
  },
  {
    key: "paymentWechatPublicKeyEncrypted",
    label: "微信支付公钥",
    value: "",
    description: "用于回调验签的微信支付公钥，入库前会加密。",
    sortOrder: 427
  },
  {
    key: "paymentWechatPublicKeyId",
    label: "微信支付公钥 ID",
    value: "",
    description: "回调验签使用的微信支付公钥 ID。",
    sortOrder: 428
  },
  {
    key: "paymentWechatAppSecretEncrypted",
    label: "微信公众平台 AppSecret",
    value: "",
    description: "用于微信内 JSAPI 场景换取 OpenID，入库前会加密。",
    sortOrder: 429
  },
  {
    key: "paymentWechatJsapiOauthCallbackUrl",
    label: "微信 JSAPI 授权回调地址",
    value: "",
    description: "微信网页授权完成后的回调地址。",
    sortOrder: 430
  },
  {
    key: "paymentWechatNativeEnabled",
    label: "微信 Native 扫码支付",
    value: "true",
    description: "在 PC 浏览器中启用微信 Native 扫码支付。",
    sortOrder: 431
  },
  {
    key: "paymentWechatH5Enabled",
    label: "微信 H5 支付",
    value: "false",
    description: "在微信外手机浏览器中启用微信 H5 支付。",
    sortOrder: 432
  },
  {
    key: "paymentWechatJsapiEnabled",
    label: "微信 JSAPI 支付",
    value: "false",
    description: "在微信内浏览器中启用微信 JSAPI 支付。",
    sortOrder: 433
  }
] as const;

type PaymentConfigKey = (typeof paymentConfigDefinitions)[number]["key"];
type ConfigValues = Record<PaymentConfigKey, string>;

export interface AlipayRuntimeConfig {
  appId: string;
  environment: "production" | "sandbox";
  gatewayUrl: string;
  privateKey: string;
  publicKey: string;
  notifyUrl: string;
  returnUrl: string;
}

export interface WechatRuntimeConfig {
  appId: string;
  merchantId: string;
  apiV3Key: string;
  merchantPrivateKey: string;
  merchantSerialNo: string;
  notifyUrl: string;
  publicKey: string;
  publicKeyId: string;
}

export interface WechatJsapiRuntimeConfig extends WechatRuntimeConfig {
  appSecret: string;
  oauthCallbackUrl: string;
}

@Injectable()
export class PaymentConfigService {
  private readonly prisma = getPrismaClient();

  async getAdminConfig() {
    const values = await this.getValues();
    const alipayReady = this.isAlipayReady(values);
    const wechatReady = this.isWechatReady(values);

    return {
      alipay: {
        enabled: values.paymentAlipayEnabled === "true",
        ready: alipayReady,
        pageEnabled: values.paymentAlipayPageEnabled === "true",
        wapEnabled: values.paymentAlipayWapEnabled === "true",
        appId: values.paymentAlipayAppId,
        environment: this.alipayEnvironment(values),
        privateKeyPreview: this.secretPreview(values.paymentAlipayPrivateKeyEncrypted),
        publicKeyPreview: this.secretPreview(values.paymentAlipayPublicKeyEncrypted),
        notifyUrl: values.paymentAlipayNotifyUrl,
        returnUrl: values.paymentAlipayReturnUrl
      },
      wechatPay: {
        enabled: values.paymentWechatEnabled === "true",
        ready: wechatReady,
        nativeEnabled: values.paymentWechatNativeEnabled === "true",
        h5Enabled: values.paymentWechatH5Enabled === "true",
        jsapiEnabled: values.paymentWechatJsapiEnabled === "true",
        jsapiReady: this.isWechatJsapiReady(values),
        appId: values.paymentWechatAppId,
        merchantId: values.paymentWechatMerchantId,
        apiV3KeyPreview: this.secretPreview(values.paymentWechatApiV3KeyEncrypted),
        merchantPrivateKeyPreview: this.secretPreview(values.paymentWechatMerchantPrivateKeyEncrypted),
        merchantSerialNo: values.paymentWechatMerchantSerialNo,
        notifyUrl: values.paymentWechatNotifyUrl,
        publicKeyPreview: this.secretPreview(values.paymentWechatPublicKeyEncrypted),
        publicKeyId: values.paymentWechatPublicKeyId,
        appSecretPreview: this.secretPreview(values.paymentWechatAppSecretEncrypted),
        jsapiOauthCallbackUrl: values.paymentWechatJsapiOauthCallbackUrl
      }
    };
  }

  async updateConfig(dto: UpdatePaymentConfigDto) {
    const current = await this.getValues();
    const next: ConfigValues = {
      paymentAlipayEnabled: String(dto.alipayEnabled),
      paymentAlipayPageEnabled: String(dto.alipayPageEnabled),
      paymentAlipayWapEnabled: String(dto.alipayWapEnabled),
      paymentAlipayAppId: dto.alipayAppId.trim(),
      paymentAlipayEnvironment: dto.alipayEnvironment === "sandbox" ? "sandbox" : "production",
      paymentAlipayPrivateKeyEncrypted: this.nextSecretValue(
        dto.alipayPrivateKey,
        current.paymentAlipayPrivateKeyEncrypted
      ),
      paymentAlipayPublicKeyEncrypted: this.nextSecretValue(
        dto.alipayPublicKey,
        current.paymentAlipayPublicKeyEncrypted
      ),
      paymentAlipayNotifyUrl: dto.alipayNotifyUrl.trim(),
      paymentAlipayReturnUrl: dto.alipayReturnUrl?.trim() ?? "",
      paymentWechatEnabled: String(dto.wechatPayEnabled),
      paymentWechatNativeEnabled: String(dto.wechatPayNativeEnabled),
      paymentWechatH5Enabled: String(dto.wechatPayH5Enabled),
      paymentWechatJsapiEnabled: String(dto.wechatPayJsapiEnabled),
      paymentWechatAppId: dto.wechatPayAppId.trim(),
      paymentWechatMerchantId: dto.wechatPayMerchantId.trim(),
      paymentWechatApiV3KeyEncrypted: this.nextSecretValue(
        dto.wechatPayApiV3Key,
        current.paymentWechatApiV3KeyEncrypted
      ),
      paymentWechatMerchantPrivateKeyEncrypted: this.nextSecretValue(
        dto.wechatPayMerchantPrivateKey,
        current.paymentWechatMerchantPrivateKeyEncrypted
      ),
      paymentWechatMerchantSerialNo: dto.wechatPayMerchantSerialNo.trim(),
      paymentWechatNotifyUrl: dto.wechatPayNotifyUrl.trim(),
      paymentWechatPublicKeyEncrypted: this.nextSecretValue(
        dto.wechatPayPublicKey,
        current.paymentWechatPublicKeyEncrypted
      ),
      paymentWechatPublicKeyId: dto.wechatPayPublicKeyId.trim(),
      paymentWechatAppSecretEncrypted: this.nextSecretValue(
        dto.wechatPayAppSecret,
        current.paymentWechatAppSecretEncrypted
      ),
      paymentWechatJsapiOauthCallbackUrl: dto.wechatPayJsapiOauthCallbackUrl.trim()
    };

    const alipayConfigError = this.getAlipayConfigError(next);

    if (dto.alipayEnabled && alipayConfigError) {
      throw new AppException(40001, alipayConfigError, HttpStatus.BAD_REQUEST);
    }

    if (dto.alipayEnabled && !dto.alipayPageEnabled && !dto.alipayWapEnabled) {
      throw new AppException(40001, "启用支付宝前，请至少启用一个支付场景", HttpStatus.BAD_REQUEST);
    }

    const wechatConfigError = this.getWechatConfigError(next);

    if (dto.wechatPayEnabled && wechatConfigError) {
      throw new AppException(40001, wechatConfigError, HttpStatus.BAD_REQUEST);
    }

    if (dto.wechatPayEnabled && !dto.wechatPayNativeEnabled && !dto.wechatPayH5Enabled && !dto.wechatPayJsapiEnabled) {
      throw new AppException(40001, "启用微信支付前，请至少启用一个支付场景", HttpStatus.BAD_REQUEST);
    }

    const wechatJsapiConfigError = this.getWechatJsapiConfigError(next);

    if (dto.wechatPayJsapiEnabled && wechatJsapiConfigError) {
      throw new AppException(40001, wechatJsapiConfigError, HttpStatus.BAD_REQUEST);
    }

    await this.prisma.$transaction(
      Object.entries(next).map(([key, value]) =>
        this.prisma.systemConfig.update({
          where: {
            key
          },
          data: {
            value
          }
        })
      )
    );

    return this.getAdminConfig();
  }

  async listAvailableProducts() {
    const values = await this.getValues();
    const products: Array<{
      provider: PaymentProvider;
      providerName: string;
      scene: PaymentScene;
      sceneName: string;
      product: PaymentProduct;
      productName: string;
      description: string;
    }> = [];

    if (values.paymentAlipayEnabled === "true" && this.isAlipayReady(values) && values.paymentAlipayPageEnabled === "true") {
      products.push({
        provider: "ALIPAY",
        providerName: "支付宝",
        scene: "DESKTOP_WEB",
        sceneName: paymentSceneName("DESKTOP_WEB"),
        product: "ALIPAY_PRECREATE",
        productName: paymentProductName("ALIPAY_PRECREATE"),
        description: "支付宝扫码后直接确认付款"
      });
    }

    if (values.paymentAlipayEnabled === "true" && this.isAlipayReady(values) && values.paymentAlipayWapEnabled === "true") {
      products.push({
        provider: "ALIPAY",
        providerName: "支付宝",
        scene: "MOBILE_WEB",
        sceneName: paymentSceneName("MOBILE_WEB"),
        product: "ALIPAY_WAP",
        productName: paymentProductName("ALIPAY_WAP"),
        description: "跳转到支付宝手机网站支付"
      });
    }

    if (values.paymentWechatEnabled === "true" && this.isWechatReady(values) && values.paymentWechatNativeEnabled === "true") {
      products.push({
        provider: "WECHAT_PAY",
        providerName: "微信支付",
        scene: "DESKTOP_WEB",
        sceneName: paymentSceneName("DESKTOP_WEB"),
        product: "WECHAT_NATIVE",
        productName: paymentProductName("WECHAT_NATIVE"),
        description: "微信 Native 扫码支付"
      });
    }

    if (values.paymentWechatEnabled === "true" && this.isWechatReady(values) && values.paymentWechatH5Enabled === "true") {
      products.push({
        provider: "WECHAT_PAY",
        providerName: "微信支付",
        scene: "MOBILE_WEB",
        sceneName: paymentSceneName("MOBILE_WEB"),
        product: "WECHAT_H5",
        productName: paymentProductName("WECHAT_H5"),
        description: "微信 H5 支付"
      });
    }

    if (values.paymentWechatEnabled === "true" && this.isWechatJsapiReady(values) && values.paymentWechatJsapiEnabled === "true") {
      products.push({
        provider: "WECHAT_PAY",
        providerName: "微信支付",
        scene: "WECHAT_BROWSER",
        sceneName: paymentSceneName("WECHAT_BROWSER"),
        product: "WECHAT_JSAPI",
        productName: paymentProductName("WECHAT_JSAPI"),
        description: "微信 JSAPI 支付"
      });
    }

    return products;
  }

  async isProductAvailable(product: PaymentProduct) {
    const products = await this.listAvailableProducts();

    return products.some((item) => item.product === product);
  }

  async getAlipayRuntimeConfig(): Promise<AlipayRuntimeConfig | null> {
    const values = await this.getValues();

    if (!this.isAlipayReady(values)) {
      return null;
    }

    return {
      appId: values.paymentAlipayAppId,
      environment: this.alipayEnvironment(values),
      gatewayUrl: this.alipayGatewayUrl(values),
      privateKey: this.decrypt(values.paymentAlipayPrivateKeyEncrypted),
      publicKey: this.decrypt(values.paymentAlipayPublicKeyEncrypted),
      notifyUrl: values.paymentAlipayNotifyUrl,
      returnUrl: values.paymentAlipayReturnUrl
    };
  }

  async getWechatRuntimeConfig(): Promise<WechatRuntimeConfig | null> {
    const values = await this.getValues();

    if (!this.isWechatReady(values)) {
      return null;
    }

    return {
      appId: values.paymentWechatAppId,
      merchantId: values.paymentWechatMerchantId,
      apiV3Key: this.decrypt(values.paymentWechatApiV3KeyEncrypted),
      merchantPrivateKey: this.decrypt(values.paymentWechatMerchantPrivateKeyEncrypted),
      merchantSerialNo: values.paymentWechatMerchantSerialNo,
      notifyUrl: values.paymentWechatNotifyUrl,
      publicKey: this.decrypt(values.paymentWechatPublicKeyEncrypted),
      publicKeyId: values.paymentWechatPublicKeyId
    };
  }

  async getWechatJsapiRuntimeConfig(): Promise<WechatJsapiRuntimeConfig | null> {
    const values = await this.getValues();

    if (!this.isWechatJsapiReady(values)) {
      return null;
    }

    return {
      ...(await this.getWechatRuntimeConfig()) as WechatRuntimeConfig,
      appSecret: this.decrypt(values.paymentWechatAppSecretEncrypted),
      oauthCallbackUrl: values.paymentWechatJsapiOauthCallbackUrl
    };
  }

  private async getValues(): Promise<ConfigValues> {
    await this.ensureDefaults();
    const configs = await this.prisma.systemConfig.findMany({
      where: {
        key: {
          in: paymentConfigDefinitions.map((definition) => definition.key)
        }
      },
      select: {
        key: true,
        value: true
      }
    });
    const configMap = new Map(configs.map((config) => [config.key, config.value]));

    return Object.fromEntries(
      paymentConfigDefinitions.map((definition) => [
        definition.key,
        configMap.get(definition.key) ?? definition.value
      ])
    ) as ConfigValues;
  }

  private async ensureDefaults() {
    await this.prisma.$transaction(
      paymentConfigDefinitions.map((definition) =>
        this.prisma.systemConfig.upsert({
          where: {
            key: definition.key
          },
          update: {
            label: definition.label,
            description: definition.description,
            group: "payment",
            isPublic: false,
            sortOrder: definition.sortOrder
          },
          create: {
            key: definition.key,
            label: definition.label,
            value: definition.value,
            description: definition.description,
            group: "payment",
            isPublic: false,
            sortOrder: definition.sortOrder
          }
        })
      )
    );
  }

  private isAlipayReady(values: ConfigValues) {
    return this.getAlipayConfigError(values) === null;
  }

  private isWechatReady(values: ConfigValues) {
    return this.getWechatConfigError(values) === null;
  }

  private isWechatJsapiReady(values: ConfigValues) {
    return this.getWechatJsapiConfigError(values) === null;
  }

  private alipayEnvironment(values: ConfigValues) {
    return values.paymentAlipayEnvironment === "sandbox" ? "sandbox" : "production";
  }

  private alipayGatewayUrl(values: ConfigValues) {
    if (process.env.ALIPAY_GATEWAY_URL) {
      return process.env.ALIPAY_GATEWAY_URL;
    }

    if (this.alipayEnvironment(values) === "sandbox") {
      return "https://openapi-sandbox.dl.alipaydev.com/gateway.do";
    }

    return "https://openapi.alipay.com/gateway.do";
  }

  private getAlipayConfigError(values: ConfigValues) {
    if (
      !values.paymentAlipayAppId ||
      !values.paymentAlipayPrivateKeyEncrypted ||
      !values.paymentAlipayPublicKeyEncrypted ||
      !values.paymentAlipayNotifyUrl
    ) {
      return "启用支付宝前，请先补全全部必填参数";
    }

    const privateKey = this.decryptSecretValue(values.paymentAlipayPrivateKeyEncrypted);

    if (!privateKey) {
      return "支付宝应用私钥无法读取，请重新保存";
    }

    if (!isValidRsaPrivateKey(privateKey)) {
      return "支付宝应用私钥格式不正确，请填写 PEM 格式或完整密钥内容";
    }

    const publicKey = this.decryptSecretValue(values.paymentAlipayPublicKeyEncrypted);

    if (!publicKey) {
      return "支付宝公钥无法读取，请重新保存";
    }

    if (!isValidRsaPublicKey(publicKey)) {
      return "支付宝公钥格式不正确，请填写 PEM 格式或完整密钥内容";
    }

    return null;
  }

  private getWechatConfigError(values: ConfigValues) {
    if (
      !values.paymentWechatAppId ||
      !values.paymentWechatMerchantId ||
      !values.paymentWechatApiV3KeyEncrypted ||
      !values.paymentWechatMerchantPrivateKeyEncrypted ||
      !values.paymentWechatMerchantSerialNo ||
      !values.paymentWechatNotifyUrl ||
      !values.paymentWechatPublicKeyEncrypted ||
      !values.paymentWechatPublicKeyId
    ) {
      return "启用微信支付前，请先补全全部必填参数";
    }

    const apiV3Key = this.decryptSecretValue(values.paymentWechatApiV3KeyEncrypted);

    if (!apiV3Key) {
      return "微信支付 APIv3 密钥无法读取，请重新保存";
    }

    if (Buffer.byteLength(apiV3Key) !== 32) {
      return "微信支付 APIv3 密钥长度必须为 32 个字符";
    }

    const merchantPrivateKey = this.decryptSecretValue(values.paymentWechatMerchantPrivateKeyEncrypted);

    if (!merchantPrivateKey) {
      return "微信支付商户 API 私钥无法读取，请重新保存";
    }

    if (!isValidRsaPrivateKey(merchantPrivateKey)) {
      return "微信支付商户 API 私钥格式不正确，请填写 PEM 格式或完整密钥内容";
    }

    const publicKey = this.decryptSecretValue(values.paymentWechatPublicKeyEncrypted);

    if (!publicKey) {
      return "微信支付公钥无法读取，请重新保存";
    }

    if (!isValidRsaPublicKey(publicKey)) {
      return "微信支付公钥格式不正确，请填写 PEM 格式或完整密钥内容";
    }

    return null;
  }

  private getWechatJsapiConfigError(values: ConfigValues) {
    const wechatConfigError = this.getWechatConfigError(values);

    if (wechatConfigError) {
      return wechatConfigError;
    }

    if (!values.paymentWechatAppSecretEncrypted || !values.paymentWechatJsapiOauthCallbackUrl) {
      return "启用微信 JSAPI 前，请先补全公众平台 AppSecret 和授权回调地址";
    }

    if (!this.decryptSecretValue(values.paymentWechatAppSecretEncrypted)) {
      return "微信公众平台 AppSecret 无法读取，请重新保存";
    }

    return null;
  }

  private nextSecretValue(input: string | undefined, current: string) {
    const trimmed = input?.trim() ?? "";

    return trimmed ? encryptSecret(trimmed) : current;
  }

  private secretPreview(value: string) {
    const decrypted = this.decryptSecretValue(value);

    return decrypted ? maskSecret(decrypted) : "尚未配置";
  }

  private decrypt(value: string) {
    return decryptSecret(value);
  }

  private decryptSecretValue(value: string) {
    if (!value) {
      return "";
    }

    try {
      return this.decrypt(value).trim();
    } catch {
      return "";
    }
  }
}
