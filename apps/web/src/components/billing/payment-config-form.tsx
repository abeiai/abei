"use client";

import { useActionState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ActionToast } from "@/components/ui/action-toast";
import {
  updatePaymentConfigAction,
  type AdminPaymentConfig,
  type PaymentConfigActionState
} from "@/lib/payment-config-api";

const initialState: PaymentConfigActionState = {};

function statusBadge(enabled: boolean, ready: boolean) {
  if (enabled && ready) {
    return (
      <Badge className="px-4 py-2 text-sm" variant="secondary">
        已启用
      </Badge>
    );
  }

  if (ready) {
    return (
      <Badge className="px-4 py-2 text-sm" variant="outline">
        已配置，未启用
      </Badge>
    );
  }

  return (
    <Badge className="px-4 py-2 text-sm" variant="muted">
      待配置
    </Badge>
  );
}

export function PaymentConfigForm({ config }: { config: AdminPaymentConfig }) {
  const [alipayState, alipayFormAction, isAlipayPending] = useActionState(updatePaymentConfigAction, initialState);
  const [wechatState, wechatFormAction, isWechatPending] = useActionState(updatePaymentConfigAction, initialState);

  return (
    <div className="flex flex-col gap-6">
      <ActionToast state={alipayState} />
      <ActionToast state={wechatState} />
      <form action={alipayFormAction}>
        <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle>支付宝</CardTitle>
            <CardDescription>同一套商户凭据下，分别控制 PC 与手机浏览器可用能力。</CardDescription>
          </div>
          <PaymentCardActions
            enabled={config.alipay.enabled}
            isPending={isAlipayPending}
            ready={config.alipay.ready}
            saveLabel="保存支付宝"
          />
        </CardHeader>
        <CardContent>
          <WechatHiddenFields config={config.wechatPay} />
          <FieldGroup className="grid gap-4 xl:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="alipay-enabled">启用支付宝</FieldLabel>
              <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-background px-3">
                <input defaultChecked={config.alipay.enabled} id="alipay-enabled" name="alipayEnabled" type="checkbox" />
                <span className="text-sm">参数完整后允许前台使用支付宝</span>
              </label>
            </Field>
            <Field>
              <FieldLabel htmlFor="alipay-app-id">AppID</FieldLabel>
              <Input id="alipay-app-id" name="alipayAppId" defaultValue={config.alipay.appId} />
            </Field>
            <Field>
              <FieldLabel htmlFor="alipay-environment">运行环境</FieldLabel>
              <Select id="alipay-environment" name="alipayEnvironment" defaultValue={config.alipay.environment}>
                <option value="production">正式环境</option>
                <option value="sandbox">沙箱环境</option>
              </Select>
              <FieldDescription>沙箱 AppID 必须选择沙箱环境，正式 AppID 必须选择正式环境。</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>场景能力</FieldLabel>
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
                <label className="flex items-center gap-3 text-sm">
                  <input defaultChecked={config.alipay.pageEnabled} name="alipayPageEnabled" type="checkbox" />
                  <span>PC 浏览器：电脑网站支付</span>
                </label>
                <label className="flex items-center gap-3 text-sm">
                  <input defaultChecked={config.alipay.wapEnabled} name="alipayWapEnabled" type="checkbox" />
                  <span>手机浏览器：手机网站支付</span>
                </label>
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="alipay-private-key">应用私钥</FieldLabel>
              <Textarea
                id="alipay-private-key"
                name="alipayPrivateKey"
                placeholder={config.alipay.privateKeyPreview}
              />
              <FieldDescription>留空表示保持现有私钥不变。</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="alipay-public-key">支付宝公钥</FieldLabel>
              <Textarea
                id="alipay-public-key"
                name="alipayPublicKey"
                placeholder={config.alipay.publicKeyPreview}
              />
              <FieldDescription>留空表示保持现有公钥不变。</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="alipay-notify-url">异步通知地址</FieldLabel>
              <Input id="alipay-notify-url" name="alipayNotifyUrl" defaultValue={config.alipay.notifyUrl} />
            </Field>
            <Field>
              <FieldLabel htmlFor="alipay-return-url">同步返回地址</FieldLabel>
              <Input id="alipay-return-url" name="alipayReturnUrl" defaultValue={config.alipay.returnUrl} />
              <FieldDescription>可选，用于用户完成支付后的浏览器跳转。</FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      </form>

      <form action={wechatFormAction}>
        <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle>微信支付</CardTitle>
            <CardDescription>按 PC、手机浏览器和微信内浏览器分别启用支付产品。</CardDescription>
          </div>
          <PaymentCardActions
            enabled={config.wechatPay.enabled}
            isPending={isWechatPending}
            ready={config.wechatPay.ready}
            saveLabel="保存微信支付"
          />
        </CardHeader>
        <CardContent>
          <AlipayHiddenFields config={config.alipay} />
          <FieldGroup className="grid gap-4 xl:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="wechat-enabled">启用微信支付</FieldLabel>
              <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-background px-3">
                <input defaultChecked={config.wechatPay.enabled} id="wechat-enabled" name="wechatPayEnabled" type="checkbox" />
                <span className="text-sm">参数完整后允许前台使用微信支付</span>
              </label>
            </Field>
            <Field>
              <FieldLabel htmlFor="wechat-app-id">AppID</FieldLabel>
              <Input id="wechat-app-id" name="wechatPayAppId" defaultValue={config.wechatPay.appId} />
            </Field>
            <Field>
              <FieldLabel>场景能力</FieldLabel>
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
                <label className="flex items-center gap-3 text-sm">
                  <input defaultChecked={config.wechatPay.nativeEnabled} name="wechatPayNativeEnabled" type="checkbox" />
                  <span>PC 浏览器：Native 扫码支付</span>
                </label>
                <label className="flex items-center gap-3 text-sm">
                  <input defaultChecked={config.wechatPay.h5Enabled} name="wechatPayH5Enabled" type="checkbox" />
                  <span>手机浏览器：H5 支付</span>
                </label>
                <label className="flex items-center gap-3 text-sm">
                  <input defaultChecked={config.wechatPay.jsapiEnabled} name="wechatPayJsapiEnabled" type="checkbox" />
                  <span>微信内浏览器：JSAPI 支付</span>
                </label>
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="wechat-merchant-id">商户号</FieldLabel>
              <Input id="wechat-merchant-id" name="wechatPayMerchantId" defaultValue={config.wechatPay.merchantId} />
            </Field>
            <Field>
              <FieldLabel htmlFor="wechat-api-v3-key">APIv3 密钥</FieldLabel>
              <Input
                id="wechat-api-v3-key"
                name="wechatPayApiV3Key"
                placeholder={config.wechatPay.apiV3KeyPreview}
              />
              <FieldDescription>留空表示保持现有密钥不变。</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="wechat-merchant-private-key">商户 API 私钥</FieldLabel>
              <Textarea
                id="wechat-merchant-private-key"
                name="wechatPayMerchantPrivateKey"
                placeholder={config.wechatPay.merchantPrivateKeyPreview}
              />
              <FieldDescription>留空表示保持现有私钥不变。</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="wechat-merchant-serial-no">商户证书序列号</FieldLabel>
              <Input
                id="wechat-merchant-serial-no"
                name="wechatPayMerchantSerialNo"
                defaultValue={config.wechatPay.merchantSerialNo}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="wechat-notify-url">通知地址</FieldLabel>
              <Input id="wechat-notify-url" name="wechatPayNotifyUrl" defaultValue={config.wechatPay.notifyUrl} />
            </Field>
            <Field>
              <FieldLabel htmlFor="wechat-public-key">微信支付公钥</FieldLabel>
              <Textarea
                id="wechat-public-key"
                name="wechatPayPublicKey"
                placeholder={config.wechatPay.publicKeyPreview}
              />
              <FieldDescription>留空表示保持现有公钥不变。</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="wechat-public-key-id">微信支付公钥 ID</FieldLabel>
              <Input id="wechat-public-key-id" name="wechatPayPublicKeyId" defaultValue={config.wechatPay.publicKeyId} />
            </Field>
            <Field>
              <FieldLabel htmlFor="wechat-app-secret">公众平台 AppSecret</FieldLabel>
              <Input
                id="wechat-app-secret"
                name="wechatPayAppSecret"
                placeholder={config.wechatPay.appSecretPreview}
              />
              <FieldDescription>仅微信内 JSAPI 支付需要；留空表示保持现有值不变。</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="wechat-jsapi-callback-url">JSAPI 授权回调地址</FieldLabel>
              <Input
                id="wechat-jsapi-callback-url"
                name="wechatPayJsapiOauthCallbackUrl"
                defaultValue={config.wechatPay.jsapiOauthCallbackUrl}
              />
              <FieldDescription>仅微信内 JSAPI 支付需要。</FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      </form>
    </div>
  );
}

function PaymentCardActions({
  enabled,
  isPending,
  ready,
  saveLabel
}: {
  enabled: boolean;
  isPending: boolean;
  ready: boolean;
  saveLabel: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-3">
      {statusBadge(enabled, ready)}
      <Button disabled={isPending} size="sm" type="submit">
        {isPending ? "保存中..." : saveLabel}
      </Button>
    </div>
  );
}

function AlipayHiddenFields({ config }: { config: AdminPaymentConfig["alipay"] }) {
  return (
    <>
      <HiddenBoolean name="alipayEnabled" value={config.enabled} />
      <HiddenBoolean name="alipayPageEnabled" value={config.pageEnabled} />
      <HiddenBoolean name="alipayWapEnabled" value={config.wapEnabled} />
      <HiddenText name="alipayAppId" value={config.appId} />
      <HiddenText name="alipayEnvironment" value={config.environment} />
      <HiddenText name="alipayPrivateKey" value="" />
      <HiddenText name="alipayPublicKey" value="" />
      <HiddenText name="alipayNotifyUrl" value={config.notifyUrl} />
      <HiddenText name="alipayReturnUrl" value={config.returnUrl} />
    </>
  );
}

function WechatHiddenFields({ config }: { config: AdminPaymentConfig["wechatPay"] }) {
  return (
    <>
      <HiddenBoolean name="wechatPayEnabled" value={config.enabled} />
      <HiddenBoolean name="wechatPayNativeEnabled" value={config.nativeEnabled} />
      <HiddenBoolean name="wechatPayH5Enabled" value={config.h5Enabled} />
      <HiddenBoolean name="wechatPayJsapiEnabled" value={config.jsapiEnabled} />
      <HiddenText name="wechatPayAppId" value={config.appId} />
      <HiddenText name="wechatPayMerchantId" value={config.merchantId} />
      <HiddenText name="wechatPayApiV3Key" value="" />
      <HiddenText name="wechatPayMerchantPrivateKey" value="" />
      <HiddenText name="wechatPayMerchantSerialNo" value={config.merchantSerialNo} />
      <HiddenText name="wechatPayNotifyUrl" value={config.notifyUrl} />
      <HiddenText name="wechatPayPublicKey" value="" />
      <HiddenText name="wechatPayPublicKeyId" value={config.publicKeyId} />
      <HiddenText name="wechatPayAppSecret" value="" />
      <HiddenText name="wechatPayJsapiOauthCallbackUrl" value={config.jsapiOauthCallbackUrl} />
    </>
  );
}

function HiddenBoolean({ name, value }: { name: string; value: boolean }) {
  return value ? <input defaultValue="on" name={name} type="hidden" /> : null;
}

function HiddenText({ name, value }: { name: string; value: string }) {
  return <input defaultValue={value} name={name} type="hidden" />;
}
