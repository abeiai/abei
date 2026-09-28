import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BillingProductManager } from "@/components/admin/billing-product-manager";
import { AdminShell } from "@/components/shell/admin-shell";
import { getAdminBillingProducts } from "@/lib/payment-admin-api";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const products = await getAdminBillingProducts();

  return (
    <AdminShell
      active="/admin/products"
      title="产品管理"
      description="管理前台用户可购买的点数充值方案。"
    >
      <div className="mb-4 flex justify-end"><Button asChild variant="outline"><Link href="/admin/memberships">管理会员订阅</Link></Button></div>
      <BillingProductManager products={products} />
    </AdminShell>
  );
}
