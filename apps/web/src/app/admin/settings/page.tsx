import { SiteAssetUploader } from "@/components/admin/site-asset-uploader";
import { AdminShell } from "@/components/shell/admin-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getAdminSystemConfigs, updateSystemConfigAction } from "@/lib/settings-api";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const settings = await getAdminSystemConfigs();
  const configByKey = new Map(settings.map((setting) => [setting.key, setting.value]));

  return (
    <AdminShell
      active="/admin/settings"
      title="系统设置"
      description="管理站点、首页、SEO、备案、客服、点数和媒体上传配置。"
    >
      <div className="flex flex-col gap-6">
        <Card>
          <CardContent>
            <form action={updateSystemConfigAction} className="grid gap-6 xl:grid-cols-2">
              <SiteAssetUploader
                initialFavicon={configByKey.get("siteFavicon") ?? ""}
                initialLogo={configByKey.get("siteLogo") ?? ""}
              />
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="site-name">站点名称</FieldLabel>
                  <Input
                    id="site-name"
                    name="siteName"
                    defaultValue={configByKey.get("siteName") ?? "学乐 AI"}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="theme-primary-color">主题主色</FieldLabel>
                  <Input
                    id="theme-primary-color"
                    name="themePrimaryColor"
                    type="color"
                    defaultValue={configByKey.get("themePrimaryColor") ?? "#0a0a0a"}
                    required
                  />
                  <FieldDescription>主题模板支持时，前台按钮、链接和强调元素使用的主色。</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="site-url">前台地址</FieldLabel>
                  <Input
                    id="site-url"
                    name="siteUrl"
                    defaultValue={configByKey.get("siteUrl") ?? "http://localhost:3321"}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="site-description">站点描述</FieldLabel>
                  <Textarea
                    id="site-description"
                    name="siteDescription"
                    defaultValue={
                      configByKey.get("siteDescription") ??
                      "面向中小学生家长和学生的 AI 学习工具，把文案、音视频和图片素材转为培训材料与专辑。"
                    }
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="analytics-code">统计代码</FieldLabel>
                  <Textarea
                    className="min-h-40 font-mono text-xs"
                    id="analytics-code"
                    name="analyticsCode"
                    defaultValue={configByKey.get("analyticsCode") ?? ""}
                    placeholder="<script>...</script>"
                  />
                  <FieldDescription>
                    请将第三方统计代码完整粘贴到这里，保存后会添加到网站全部页面的 &lt;/head&gt; 标签前。
                  </FieldDescription>
                </Field>
              </FieldGroup>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="seo-title">SEO 标题</FieldLabel>
                  <Input
                    id="seo-title"
                    name="seoTitle"
                    defaultValue={configByKey.get("seoTitle") ?? "学乐 AI - AI 学习材料工坊"}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="seo-description">SEO 描述</FieldLabel>
                  <Textarea
                    id="seo-description"
                    name="seoDescription"
                    defaultValue={
                      configByKey.get("seoDescription") ??
                      "面向中小学生家长和学生，把文案、音视频和图片素材转为专业培训材料与专辑。"
                    }
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="beian-no">备案号</FieldLabel>
                  <Input
                    id="beian-no"
                    name="beianNo"
                    defaultValue={configByKey.get("beianNo") ?? "待备案"}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="copyright-text">版权信息</FieldLabel>
                  <Input
                    id="copyright-text"
                    name="copyrightText"
                    defaultValue={configByKey.get("copyrightText") ?? "© 2026 学乐 AI 版权所有"}
                    placeholder="© 2026 公司名称 版权所有"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="service-qr-code">客服二维码</FieldLabel>
                  <Input
                    id="service-qr-code"
                    name="serviceQrCode"
                    defaultValue={configByKey.get("serviceQrCode") ?? ""}
                    placeholder="https://example.com/qrcode.png"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="default-credit-exchange-rate">默认点数兑换比例</FieldLabel>
                  <Input
                    id="default-credit-exchange-rate"
                    name="defaultCreditExchangeRate"
                    defaultValue={configByKey.get("defaultCreditExchangeRate") ?? "1 元 = 100 点"}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="api-base-url">API 地址</FieldLabel>
                  <Input
                    id="api-base-url"
                    name="apiBaseUrl"
                    defaultValue={configByKey.get("apiBaseUrl") ?? "http://localhost:3322/api"}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="registration-status">注册入口</FieldLabel>
                  <Input
                    id="registration-status"
                    name="registrationStatus"
                    defaultValue={configByKey.get("registrationStatus") ?? "开放"}
                    required
                  />
                </Field>
                <FieldGroup className="rounded-lg border border-border bg-background p-4">
                  <Field>
                    <FieldLabel htmlFor="media-image-max-size-mb">图片上传大小</FieldLabel>
                    <Input
                      id="media-image-max-size-mb"
                      name="mediaImageMaxSizeMb"
                      type="number"
                      min="1"
                      max="200"
                      defaultValue={configByKey.get("mediaImageMaxSizeMb") ?? "10"}
                      required
                    />
                    <FieldDescription>单位 MB，默认 10MB。</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="media-audio-max-size-mb">音频上传大小</FieldLabel>
                    <Input
                      id="media-audio-max-size-mb"
                      name="mediaAudioMaxSizeMb"
                      type="number"
                      min="1"
                      max="200"
                      defaultValue={configByKey.get("mediaAudioMaxSizeMb") ?? "20"}
                      required
                    />
                    <FieldDescription>单位 MB，默认 20MB。</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="media-video-max-size-mb">视频上传大小</FieldLabel>
                    <Input
                      id="media-video-max-size-mb"
                      name="mediaVideoMaxSizeMb"
                      type="number"
                      min="1"
                      max="200"
                      defaultValue={configByKey.get("mediaVideoMaxSizeMb") ?? "200"}
                      required
                    />
                    <FieldDescription>单位 MB，默认 200MB。</FieldDescription>
                  </Field>
                </FieldGroup>
                <FieldGroup className="rounded-lg border border-border bg-background p-4">
                  <Field>
                    <FieldLabel htmlFor="enterprise-account-enabled">企业账号体系</FieldLabel>
                    <select
                      className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                      id="enterprise-account-enabled"
                      name="enterpriseAccountEnabled"
                      defaultValue={configByKey.get("enterpriseAccountEnabled") ?? "false"}
                    >
                      <option value="false">停用</option>
                      <option value="true">启用</option>
                    </select>
                    <FieldDescription>
                      停用时不开放企业空间、企业钱包和员工额度，不影响个人用户、个人钱包和现有 AI 功能。
                    </FieldDescription>
                  </Field>
                </FieldGroup>
                <Button className="w-fit" type="submit">保存配置</Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
