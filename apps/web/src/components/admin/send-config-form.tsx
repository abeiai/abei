"use client";

import { useActionState } from "react";
import { Mail, MessageSquareText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ActionToast } from "@/components/ui/action-toast";
import {
  updateEmailSendConfigAction,
  updateSmsSendConfigAction,
  type AdminSendConfig,
  type SendConfigActionState
} from "@/lib/send-config-api";

const initialState: SendConfigActionState = {};

export function SendConfigForm({ config }: { config: AdminSendConfig }) {
  const [emailState, emailFormAction, isEmailPending] = useActionState(updateEmailSendConfigAction, initialState);
  const [smsState, smsFormAction, isSmsPending] = useActionState(updateSmsSendConfigAction, initialState);

  return (
    <div className="flex flex-col gap-6">
      <ActionToast state={emailState} />
      <ActionToast state={smsState} />
      <form action={emailFormAction}>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <CardTitle className="flex items-center gap-2">
                <Mail className="size-5" />
                邮件验证
              </CardTitle>
              <CardDescription>配置阿里云邮件推送 DirectMail，用于邮箱验证码发送。</CardDescription>
            </div>
            <ConfigCardActions
              enabled={config.email.enabled}
              isPending={isEmailPending}
              ready={config.email.ready}
              saveLabel="保存邮件配置"
            />
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-4 xl:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="email-enabled">启用邮件验证</FieldLabel>
                <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-background px-3">
                  <input
                    defaultChecked={config.email.enabled}
                    id="email-enabled"
                    name="emailVerificationEnabled"
                    type="checkbox"
                  />
                  <span className="text-sm">配置完整后使用阿里云邮件发送验证码</span>
                </label>
              </Field>
              <Field>
                <FieldLabel htmlFor="email-provider">邮件方案</FieldLabel>
                <Select id="email-provider" name="emailVerificationProvider" defaultValue={config.email.provider}>
                  <option value="ALIYUN_DIRECT_MAIL">阿里云邮件推送 DirectMail</option>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="mail-access-key-id">AccessKey ID</FieldLabel>
                <Input
                  id="mail-access-key-id"
                  name="aliyunMailAccessKeyId"
                  defaultValue={config.email.accessKeyId}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="mail-access-key-secret">AccessKey Secret</FieldLabel>
                <Input
                  id="mail-access-key-secret"
                  name="aliyunMailAccessKeySecret"
                  placeholder={config.email.accessKeySecretPreview}
                />
                <FieldDescription>留空表示保持现有密钥不变。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="mail-endpoint">Endpoint</FieldLabel>
                <Input id="mail-endpoint" name="aliyunMailEndpoint" defaultValue={config.email.endpoint} />
              </Field>
              <Field>
                <FieldLabel htmlFor="mail-region-id">RegionId</FieldLabel>
                <Input id="mail-region-id" name="aliyunMailRegionId" defaultValue={config.email.regionId} />
              </Field>
              <Field>
                <FieldLabel htmlFor="mail-account-name">发信地址 AccountName</FieldLabel>
                <Input
                  id="mail-account-name"
                  name="aliyunMailAccountName"
                  defaultValue={config.email.accountName}
                  placeholder="notice@example.com"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="mail-from-alias">发信人昵称 FromAlias</FieldLabel>
                <Input id="mail-from-alias" name="aliyunMailFromAlias" defaultValue={config.email.fromAlias} />
              </Field>
              <Field>
                <FieldLabel htmlFor="mail-address-type">AddressType</FieldLabel>
                <Select id="mail-address-type" name="aliyunMailAddressType" defaultValue={config.email.addressType}>
                  <option value="1">发信地址</option>
                  <option value="0">随机账号</option>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="mail-reply-to-address">回信地址</FieldLabel>
                <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-background px-3">
                  <input
                    defaultChecked={config.email.replyToAddress}
                    id="mail-reply-to-address"
                    name="aliyunMailReplyToAddress"
                    type="checkbox"
                  />
                  <span className="text-sm">使用发信地址作为回信地址</span>
                </label>
              </Field>
              <Field>
                <FieldLabel htmlFor="mail-subject">验证码邮件标题</FieldLabel>
                <Input id="mail-subject" name="aliyunMailSubject" defaultValue={config.email.subject} />
              </Field>
              <Field className="xl:col-span-2">
                <FieldLabel htmlFor="mail-body-template">验证码邮件模板</FieldLabel>
                <Textarea
                  id="mail-body-template"
                  name="aliyunMailBodyTemplate"
                  defaultValue={config.email.bodyTemplate}
                  rows={4}
                />
                <FieldDescription>使用 <code>{"${code}"}</code> 作为验证码变量。</FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </form>

      <form action={smsFormAction}>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <CardTitle className="flex items-center gap-2">
                <MessageSquareText className="size-5" />
                手机短信验证
              </CardTitle>
              <CardDescription>配置阿里云短信服务，用于手机号登录和绑定验证码。</CardDescription>
            </div>
            <ConfigCardActions
              enabled={config.sms.enabled}
              isPending={isSmsPending}
              ready={config.sms.ready}
              saveLabel="保存短信配置"
            />
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-4 xl:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="sms-enabled">启用短信验证</FieldLabel>
                <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-background px-3">
                  <input
                    defaultChecked={config.sms.enabled}
                    id="sms-enabled"
                    name="smsVerificationEnabled"
                    type="checkbox"
                  />
                  <span className="text-sm">配置完整后使用阿里云发送短信验证码</span>
                </label>
              </Field>
              <Field>
                <FieldLabel htmlFor="sms-provider">短信方案</FieldLabel>
                <Select id="sms-provider" name="smsVerificationProvider" defaultValue={config.sms.provider}>
                  <option value="ALIYUN_SMS">阿里云短信服务 SendSms</option>
                  <option value="ALIYUN_DYPNS">阿里云号码认证 SendSmsVerifyCode</option>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="sms-access-key-id">AccessKey ID</FieldLabel>
                <Input id="sms-access-key-id" name="aliyunSmsAccessKeyId" defaultValue={config.sms.accessKeyId} />
                <FieldDescription>
                  普通短信需具备 <code>dysms:SendSms</code> 权限；号码认证需具备{" "}
                  <code>dypns:SendSmsVerifyCode</code> 和 <code>dypns:CheckSmsVerifyCode</code> 权限。
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="sms-access-key-secret">AccessKey Secret</FieldLabel>
                <Input
                  id="sms-access-key-secret"
                  name="aliyunSmsAccessKeySecret"
                  placeholder={config.sms.accessKeySecretPreview}
                />
                <FieldDescription>留空表示保持现有密钥不变。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="sms-endpoint">Endpoint</FieldLabel>
                <Input id="sms-endpoint" name="aliyunSmsEndpoint" defaultValue={config.sms.endpoint} />
              </Field>
              <Field>
                <FieldLabel htmlFor="sms-region-id">RegionId</FieldLabel>
                <Input id="sms-region-id" name="aliyunSmsRegionId" defaultValue={config.sms.regionId} />
              </Field>
              <Field>
                <FieldLabel htmlFor="sms-sign-name">短信签名 SignName</FieldLabel>
                <Input id="sms-sign-name" name="aliyunSmsSignName" defaultValue={config.sms.signName} />
              </Field>
              <Field>
                <FieldLabel htmlFor="sms-template-code">短信模板 TemplateCode</FieldLabel>
                <Input id="sms-template-code" name="aliyunSmsTemplateCode" defaultValue={config.sms.templateCode} />
              </Field>
              <Field>
                <FieldLabel htmlFor="sms-template-param-code-key">验证码变量名</FieldLabel>
                <Input
                  id="sms-template-param-code-key"
                  name="aliyunSmsTemplateParamCodeKey"
                  defaultValue={config.sms.templateParamCodeKey}
                />
                <FieldDescription>
                  默认是 <code>code</code>，普通短信会传入 6 位验证码。
                </FieldDescription>
              </Field>
              <Field className="xl:col-span-2">
                <FieldLabel htmlFor="sms-template-param-extra-json">其他模板参数 JSON</FieldLabel>
                <Textarea
                  id="sms-template-param-extra-json"
                  name="aliyunSmsTemplateParamExtraJson"
                  rows={3}
                  defaultValue={config.sms.templateParamExtraJson}
                  placeholder='{"min":"5"}'
                />
                <FieldDescription>
                  如果短信模板含有效期等变量，在这里补齐。常见模板需要 <code>{"{\"min\":\"5\"}"}</code>。
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="sms-code-ttl-seconds">验证码有效期（秒）</FieldLabel>
                <Input
                  id="sms-code-ttl-seconds"
                  name="smsCodeTtlSeconds"
                  type="number"
                  min="60"
                  max="1800"
                  defaultValue={config.sms.codeTtlSeconds}
                />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

function ConfigCardActions({
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
