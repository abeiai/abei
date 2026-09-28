import { SendConfigForm } from "@/components/admin/send-config-form";
import { AdminShell } from "@/components/shell/admin-shell";
import { getAdminSendConfig } from "@/lib/send-config-api";

export const dynamic = "force-dynamic";

export default async function AdminSendConfigPage() {
  const config = await getAdminSendConfig();

  return (
    <AdminShell
      active="/admin/send"
      title="邮件短信"
      description="配置邮件验证码和手机短信验证码的阿里云发送方案。"
    >
      <SendConfigForm config={config} />
    </AdminShell>
  );
}
