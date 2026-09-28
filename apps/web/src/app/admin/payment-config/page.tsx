import { AdminShell } from "@/components/shell/admin-shell";
import { PaymentConfigForm } from "@/components/billing/payment-config-form";
import { getAdminPaymentConfig } from "@/lib/payment-config-api";

export const dynamic = "force-dynamic";

export default async function AdminPaymentConfigPage() {
  const config = await getAdminPaymentConfig();

  return (
    <AdminShell
      active="/admin/payment-config"
      title="支付配置"
      description="配置真实商户参数，并决定前台允许使用哪些支付方式。"
    >
      <PaymentConfigForm config={config} />
    </AdminShell>
  );
}
