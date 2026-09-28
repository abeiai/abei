import { requireAccountProfile } from "@/lib/profile-api";
import { MembershipPlans } from "@/components/billing/membership-plans";
import { getMembershipPlans, getMyMembership } from "@/lib/membership-api";
import { membershipProduct, membershipNextStart, membershipEndDate, membershipPeriods, type MembershipTerm } from "@/lib/membership";
import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import {
  CheckCircle2,
  Coins,
  CreditCard,
  QrCode,
  WalletCards,
  X
} from "lucide-react";

import { PaymentOrderForm } from "@/components/billing/payment-order-form";
import { PaymentPoller } from "@/components/billing/payment-poller";
import { WechatJsapiLauncher } from "@/components/billing/wechat-jsapi-launcher";
import { MarkdownContent } from "@/components/markdown/markdown-content";
import { PublicShell } from "@/components/shell/public-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOptionalCurrentUser } from "@/lib/auth-actions";
import {
  createPaymentOrderAction,
  getAvailablePaymentProducts,
  getPaymentOrder,
  getRechargeProducts,
  getWallet,
  mockPayOrderAction,
  type PaymentOrder,
  type RechargeProduct
} from "@/lib/billing-api";
import { isPendingPaymentStatus } from "@/lib/payment-polling";
import { detectPaymentScene } from "@/lib/payment-scene";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "选择适合的会员套餐 - 学乐 AI",
  description: "选择学乐 AI 会员等级与付费周期，或按需购买点数。"
};

type PricingSearchParams = {
  error?: string;
  order?: string;
  package?: string;
  paid?: string;
  recharge?: string;
};

function searchTarget(params: PricingSearchParams) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, value);
    }
  });

  const query = searchParams.toString();

  return query ? `/pricing?${query}` : "/pricing";
}

function findProductForOrder(products: RechargeProduct[], order: PaymentOrder | null, packageCode?: string) {
  if (order?.membershipSnapshot) {
    const snapshot = order.membershipSnapshot;
    return membershipProduct({ ...snapshot, id: snapshot.planId, isEnabled: true, prices: [] }, {
      ...snapshot, originalPriceCny: snapshot.amountCny, discountPercent: 100, salePriceCny: null,
      isEnabled: true, pricePer100Credits: snapshot.credits > 0 ? (Number(snapshot.amountCny) * 100 / snapshot.credits).toFixed(2) : null
    });
  }
  return (
    products.find((product) => product.code === packageCode) ??
    (order
      ? products.find((product) => product.credits === order.credits && product.amountCny === order.amountCny)
      : null) ??
    null
  );
}

export default async function PricingPage({
  searchParams
}: {
  searchParams: Promise<PricingSearchParams>;
}) {
  const params = await searchParams;
  const wantsPurchaseModal = Boolean(params.package || params.order || params.error || params.paid);
  const [rechargeProducts, user, membershipPlans] = await Promise.all([
    getRechargeProducts().catch(() => []),
    getOptionalCurrentUser(),
    getMembershipPlans()
  ]);
  const loginNext = searchTarget(params);

  if (wantsPurchaseModal && !user) {
    redirect(`/login?next=${encodeURIComponent(loginNext)}`);
  }

  if (user && wantsPurchaseModal) await requireAccountProfile(loginNext);

  const currentOrder = user && params.order ? await getPaymentOrder(params.order).catch(() => null) : null;
  const selectedProduct = findProductForOrder([...rechargeProducts, ...membershipPlans.flatMap((plan) => plan.prices.filter((price) => price.isEnabled).map((price) => membershipProduct(plan, price)))], currentOrder, params.package);
  const [membership, wallet] = user
    ? await Promise.all([getMyMembership(), getWallet().catch(() => null)])
    : [null, null];
  const membershipStartsAt = membership ? membershipNextStart(membership) : null;
  const membershipTerm = selectedProduct?.billingMode === "SUBSCRIPTION"
    ? selectedProduct.code.split(":")[2] as MembershipTerm : null;
  const membershipEndsAt = membershipTerm
    ? currentOrder?.status === "PAID" && membershipStartsAt
      ? membershipStartsAt
      : membershipEndDate(new Date(membershipStartsAt ?? currentOrder?.paidAt ?? Date.now()), membershipTerm).toISOString()
    : null;
  const requestHeaders = wantsPurchaseModal ? await headers() : null;
  const availableProducts =
    wantsPurchaseModal && selectedProduct ? await getAvailablePaymentProducts().catch(() => []) : [];
  const pendingPayment = isPendingPaymentStatus(currentOrder?.status);
  const qrPayload =
    currentOrder?.paymentMode === "REAL" && pendingPayment
      ? currentOrder.qrCodeUrl ?? currentOrder.paymentUrl
      : null;
  const qrCodeDataUrl = qrPayload
    ? await QRCode.toDataURL(qrPayload, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 180
      })
    : null;
  const initialScene = requestHeaders ? detectPaymentScene(requestHeaders.get("user-agent")) : "DESKTOP_WEB";
  const pollerSuccessHref = currentOrder
    ? searchTarget({
        package: selectedProduct?.code ?? params.package,
        order: currentOrder.id,
        paid: "1"
      })
    : "/pricing";

  return (
    <PublicShell>
      <PaymentPoller
        enabled={Boolean(currentOrder && currentOrder.paymentMode === "REAL" && pendingPayment)}
        orderId={currentOrder?.id ?? null}
        successHref={pollerSuccessHref}
      />
      <section className="flex w-full flex-col gap-10 px-5 py-12 md:py-16">
        <div className="flex flex-col gap-9">
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="flex max-w-5xl flex-col items-center gap-5">
              <h1 className="font-display text-5xl font-semibold leading-tight tracking-normal md:text-7xl">
                选择适合的会员套餐
              </h1>
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-base text-muted-foreground">
                <span>当前等级：{membership?.current?.name ?? "非会员"}</span>
                <span>剩余点数：{wallet ? `${wallet.availableCredits.toLocaleString("zh-CN")}点` : user ? "暂不可用" : "登录后查看"}</span>
                <Button asChild variant="outline"><Link href="/pricing?recharge=1">购买点数</Link></Button>
              </div>
            </div>
          </div>

          <MembershipPlans plans={membershipPlans} isLoggedIn={Boolean(user)} />

        </div>
      </section>


      {params.recharge === "1" && !wantsPurchaseModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 px-4 py-6 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="recharge-title" className="max-h-[92vh] w-full max-w-7xl overflow-y-auto rounded-2xl border border-border bg-background p-5 shadow-2xl md:p-7">
            <div className="mb-6 flex items-center justify-between gap-4">
              <h2 id="recharge-title" className="text-2xl font-semibold">点数充值</h2>
              <Button asChild variant="outline" className="size-10 rounded-full p-0"><Link aria-label="关闭点数充值" href="/pricing"><X className="size-4" /></Link></Button>
            </div>
          <div className="grid justify-center gap-3 sm:grid-cols-[repeat(auto-fit,minmax(280px,390px))]">
            {rechargeProducts.length > 0 ? (
              rechargeProducts.map((product, index) => (
                <PricingProductCard isLoggedIn={Boolean(user)} index={index} key={product.code} product={product} />
              ))
            ) : (
              <Card className="w-full max-w-xl">
                <CardHeader>
                  <CardTitle>暂无可用充值套餐</CardTitle>
                  <CardDescription>后台产品管理启用充值产品后，前台价格页会自动展示。</CardDescription>
                </CardHeader>
              </Card>
            )}
          </div>
          </section>
        </div>
      ) : null}

      {wantsPurchaseModal ? (
        <PricingPurchaseModal
          membershipEndsAt={membershipEndsAt}
          membershipTerm={membershipTerm}
          availableProducts={availableProducts}
          currentOrder={currentOrder}
          error={params.error}
          initialScene={initialScene}
          paid={params.paid}
          product={selectedProduct}
          qrCodeDataUrl={qrCodeDataUrl}
        />
      ) : null}
    </PublicShell>
  );
}

function PricingProductCard({
  index,
  isLoggedIn,
  product
}: {
  index: number;
  isLoggedIn: boolean;
  product: RechargeProduct;
}) {
  const isFeatured = index === 1;
  const benefits = product.benefitsMarkdown?.trim() || fallbackBenefits(product);
  const checkoutPath = `/pricing?package=${encodeURIComponent(product.code)}`;
  const selectHref = isLoggedIn
    ? checkoutPath
    : `/login?next=${encodeURIComponent(checkoutPath)}`;

  return (
    <article className="xueleai-pricing-card mx-auto flex min-h-[620px] w-full max-w-[390px] flex-col border border-border bg-card p-4 md:p-5">
      <div
        className={
          isFeatured
            ? "flex min-h-52 flex-col justify-between rounded-md bg-primary p-6 text-primary-foreground"
            : "flex min-h-52 flex-col justify-between rounded-md border border-border bg-card p-6"
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-normal">{product.name}</h2>
            <p className={isFeatured ? "text-sm text-primary-foreground/75" : "text-sm text-muted-foreground"}>
              {product.code}
            </p>
          </div>
          {isFeatured ? (
            <span className="rounded-full border border-primary-foreground/45 px-3 py-1 text-xs font-medium">推荐</span>
          ) : null}
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-end gap-2">
            <span className="font-display text-5xl font-semibold tracking-normal">¥{product.amountCny}</span>
            <span className={isFeatured ? "pb-2 text-sm text-primary-foreground/75" : "pb-2 text-sm text-muted-foreground"}>
              / 次充值
            </span>
          </div>
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Coins className="size-5" />
            {product.credits.toLocaleString("zh-CN")} 点
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-6 px-1 py-6">
        <p className="min-h-12 text-sm leading-6 text-muted-foreground">{product.description}</p>
        <Button asChild className="h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
          <Link href={selectHref}>购买 {product.name}</Link>
        </Button>
        <div className="border-t border-dotted border-border pt-5">
          <MarkdownContent
            className="text-sm leading-6 text-foreground [&_.incremark]:gap-3 [&_.incremark-list]:gap-3 [&_.incremark-list]:pl-5"
            content={benefits}
          />
        </div>
      </div>
    </article>
  );
}

function PricingPurchaseModal({
  membershipEndsAt,
  membershipTerm,
  availableProducts,
  currentOrder,
  error,
  initialScene,
  paid,
  product,
  qrCodeDataUrl
}: {
  membershipEndsAt: string | null;
  membershipTerm: MembershipTerm | null;
  availableProducts: Awaited<ReturnType<typeof getAvailablePaymentProducts>>;
  currentOrder: PaymentOrder | null;
  error?: string;
  initialScene: ReturnType<typeof detectPaymentScene>;
  paid?: string;
  product: RechargeProduct | null;
  qrCodeDataUrl: string | null;
}) {
  const authorizeRedirect = product ? `/pricing?package=${encodeURIComponent(product.code)}` : "/pricing";
  const authorizeUrl = `${process.env.PUBLIC_API_BASE_URL ?? "http://localhost:3322/api"}/payment/wechat/jsapi/authorize?redirect=${encodeURIComponent(authorizeRedirect)}`;
  const pendingPayment = isPendingPaymentStatus(currentOrder?.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-md border border-border bg-background shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-background/95 px-5 py-4 backdrop-blur md:px-7">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground">{product?.billingMode === "SUBSCRIPTION" ? "会员订阅" : "点数充值"}</p>
            <h2 className="text-2xl font-semibold tracking-normal">
              {product ? `购买 ${product.name}` : "购买充值包"}
            </h2>
          </div>
          <Button asChild className="size-10 rounded-full p-0" variant="outline">
            <Link aria-label="关闭购买弹窗" href="/pricing">
              <X className="size-4" />
            </Link>
          </Button>
        </div>

        <div className="grid items-stretch gap-6 p-5 md:p-7 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="flex h-full flex-col">
            <CardHeader className="flex flex-row items-center gap-3">
              <div className="xueleai-icon-tile flex size-11 items-center justify-center rounded-md">
                <WalletCards />
              </div>
              <CardTitle>已选套餐</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              {product ? (
                <div className="flex flex-col gap-5">
                  <div className="rounded-md bg-primary p-6 text-primary-foreground">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-2">
                        <h3 className="text-2xl font-semibold">{product.name}</h3>
                        {product.billingMode !== "SUBSCRIPTION" && <p className="text-sm text-primary-foreground/75">{product.code}</p>}
                      </div>
                      <Badge className="bg-primary-foreground text-primary hover:bg-primary-foreground">{product.billingModeName}</Badge>
                    </div>
                    <div className="mt-10 flex flex-col gap-3">
                      <div className="flex flex-wrap items-baseline gap-1">
                        <span className="text-lg font-semibold">¥</span>
                        <span className="text-4xl font-semibold">{product.amountCny.replace(/\.00$/, "")}</span>
                        <span className="ml-1 text-sm text-primary-foreground/75">{membershipTerm ? `每${membershipPeriods[membershipTerm]}` : "/ 次充值"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-lg font-semibold">
                        <Coins className="size-5" />
                        {product.credits.toLocaleString("zh-CN")} 点
                      </div>
                    </div>
                  </div>
                  {membershipEndsAt && <p className="text-sm font-semibold">会员有效期延至：{new Date(membershipEndsAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric" })}</p>}
                  <p className="text-sm leading-6 text-muted-foreground">{product.description}</p>
                  <div className="border-t border-dotted border-border pt-5">
                    <MarkdownContent
                      className="text-sm leading-6 [&_.incremark]:gap-3 [&_.incremark-list]:gap-3 [&_.incremark-list]:pl-5"
                      content={product.benefitsMarkdown?.trim() || fallbackBenefits(product)}
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-background p-6 text-sm text-muted-foreground">
                  暂无可用充值套餐，请联系管理员在后台产品管理中启用充值产品。
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex h-full flex-col">
            <CardHeader className="flex flex-row items-center gap-3">
              <div className="xueleai-icon-tile flex size-11 items-center justify-center rounded-md">
                <CreditCard />
              </div>
              <CardTitle>选择支付方式</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-6">
              <PaymentOrderForm
                action={createPaymentOrderAction}
                submitLabel="创建支付订单"
                authorizeUrl={authorizeUrl}
                initialScene={initialScene}
                mode="buttons"
                products={availableProducts}
                rechargeOptions={product ? [product] : []}
                returnPath="/pricing"
                selectedPackageCode={product?.code}
                selectedProvider={currentOrder?.provider ?? null}
                showPackageOptions={false}
              />

              <div className="flex min-h-[320px] flex-1 flex-col items-center justify-center gap-4 rounded-md border border-dashed border-border bg-muted/20 p-5 text-center">
                {currentOrder ? (
                  <>
                    {currentOrder.paymentMode === "UNCONFIGURED" && pendingPayment ? (
                      <>
                        <div className="xueleai-icon-tile flex size-[180px] items-center justify-center rounded-md">
                          <QrCode className="size-20 text-muted-foreground" />
                        </div>
                        <p className="max-w-[220px] text-xs leading-5 text-muted-foreground">
                          当前支付方式尚未正式接入，暂显示替代图标。
                        </p>
                      </>
                    ) : null}

                    {qrCodeDataUrl ? (
                      <div className="flex flex-col items-center gap-3">
                        <img alt="二维码" className="size-[180px]" src={qrCodeDataUrl} />
                        <p className="max-w-[220px] text-center text-xs leading-5 text-muted-foreground">
                          请扫码完成支付，页面会自动刷新订单状态。
                        </p>
                      </div>
                    ) : null}

                    {currentOrder.action === "REDIRECT" &&
                    currentOrder.paymentMode === "REAL" &&
                    pendingPayment &&
                    currentOrder.paymentUrl ? (
                      <Button asChild className="w-fit" variant="outline">
                        <a href={currentOrder.paymentUrl} rel="noreferrer" target="_blank">
                          打开支付页
                        </a>
                      </Button>
                    ) : null}

                    {currentOrder.action === "WECHAT_JSAPI" && pendingPayment && currentOrder.launchParams ? (
                      <WechatJsapiLauncher params={currentOrder.launchParams} />
                    ) : null}

                    {error ? (
                      <p className="max-w-[280px] text-sm leading-6 text-destructive">操作失败：{error}</p>
                    ) : null}

                    {paid ? (
                      <p className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="size-4" />
                        支付成功，点数或会员权益已入账。
                      </p>
                    ) : null}

                    {pendingPayment && currentOrder.paymentMode === "UNCONFIGURED" ? (
                      <form action={mockPayOrderAction}>
                        <input name="orderId" type="hidden" value={currentOrder.id} />
                        <input name="orderNo" type="hidden" value={currentOrder.orderNo} />
                        <input name="packageCode" type="hidden" value={product?.code ?? ""} />
                        <input name="provider" type="hidden" value={currentOrder.provider} />
                        <input name="returnPath" type="hidden" value="/pricing" />
                        <Button type="submit" variant="outline">
                          模拟支付成功回调
                        </Button>
                      </form>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="rounded-xl border border-dashed border-border bg-background p-6 text-sm text-muted-foreground">
                      请选择支付方式。订单创建后，这里会展示二维码或替代图标。
                    </div>
                    {error ? (
                      <p className="max-w-[280px] text-sm leading-6 text-destructive">操作失败：{error}</p>
                    ) : null}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function fallbackBenefits(product: RechargeProduct) {
  return [
    `- 获得 ${product.credits.toLocaleString("zh-CN")} 点平台点数`,
    "- 支持学习材料与体验区 AI 任务消耗",
    "- 充值后可在用户中心查看余额和流水"
  ].join("\n");
}
