"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { PaymentProviderLabel } from "@/components/billing/payment-provider-label";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { detectPaymentScene, paymentSceneName, type PaymentScene } from "@/lib/payment-scene";
import { cn } from "@/lib/utils";
import type { AvailablePaymentProduct, PaymentProvider, RechargeProduct } from "@/lib/billing-api";

interface PaymentOrderFormProps {
  action: (formData: FormData) => void;
  authorizeUrl: string;
  initialScene: PaymentScene;
  products: AvailablePaymentProduct[];
  rechargeOptions: RechargeProduct[];
  mode?: "select" | "buttons";
  returnPath?: string;
  selectedProvider?: PaymentProvider | null;
  selectedPackageCode?: string;
  showPackageOptions?: boolean;
  submitLabel?: string;
}

export function PaymentOrderForm({
  action,
  authorizeUrl,
  initialScene,
  mode = "select",
  products,
  rechargeOptions,
  returnPath,
  selectedProvider,
  selectedPackageCode,
  showPackageOptions = true,
  submitLabel = "创建充值订单"
}: PaymentOrderFormProps) {
  const [scene, setScene] = useState<PaymentScene>(initialScene);

  useEffect(() => {
    setScene(detectPaymentScene(window.navigator.userAgent));
  }, []);

  const sceneProducts = useMemo(
    () => products.filter((product) => product.scene === scene),
    [products, scene]
  );
  const selectedProduct = sceneProducts[0] ?? null;
  const needsAuthorization = selectedProduct?.requiresAuthorization ?? false;
  const selectedPackageIndex = rechargeOptions.findIndex((item) => item.code === selectedPackageCode);
  const defaultPackageIndex = selectedPackageIndex >= 0 ? selectedPackageIndex : rechargeOptions.length > 1 ? 1 : 0;
  const selectedPackage = rechargeOptions[defaultPackageIndex] ?? null;

  return (
    <form action={action} className="flex flex-col gap-6">
      {returnPath ? <input name="returnPath" type="hidden" value={returnPath} /> : null}
      {!showPackageOptions && selectedPackage ? (
        <input name="packageCode" type="hidden" value={selectedPackage.code} />
      ) : null}
      <FieldGroup>
        {showPackageOptions ? (
          <Field>
            <FieldLabel>充值套餐</FieldLabel>
            <div className="grid gap-3 md:grid-cols-3">
              {rechargeOptions.length > 0 ? rechargeOptions.map((item, index) => (
                <label
                  className="flex cursor-pointer flex-col gap-3 rounded-xl border border-border bg-background p-4"
                  key={item.code}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-medium">{item.name}</span>
                    <input defaultChecked={index === defaultPackageIndex} name="packageCode" type="radio" value={item.code} />
                  </span>
                  <span className="font-display text-3xl font-light">¥{item.amountCny}</span>
                  <span className="text-sm text-muted-foreground">
                    {item.credits.toLocaleString("zh-CN")} 点 · {item.description}
                  </span>
                </label>
              )) : (
                <div className="rounded-lg border border-dashed border-border bg-background px-3 py-3 text-sm text-muted-foreground md:col-span-3">
                  暂无可用充值套餐，请联系管理员在后台产品管理中启用充值产品。
                </div>
              )}
            </div>
          </Field>
        ) : null}
        <Field>
          {mode === "buttons" ? null : <FieldLabel htmlFor="provider">支付方式</FieldLabel>}
          <input name="scene" type="hidden" value={scene} />
          {sceneProducts.length > 0 && mode === "buttons" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {sceneProducts.map((product) => {
                const isSelected = product.provider === selectedProvider;
                const className = cn(
                  "h-auto min-h-14 justify-start rounded-xl px-4 py-3 text-left transition",
                  isSelected && "border-foreground bg-secondary shadow-sm ring-1 ring-foreground/20 hover:bg-secondary"
                );

                return product.requiresAuthorization ? (
                  <Button asChild className={className} key={product.product} variant="outline">
                    <a href={authorizeUrl}>
                      <PaymentProviderLabel provider={product.provider} providerName={product.providerName} />
                    </a>
                  </Button>
                ) : (
                  <Button
                    className={className}
                    key={product.product}
                    name="provider"
                    type="submit"
                    value={product.provider}
                    variant="outline"
                  >
                    <PaymentProviderLabel provider={product.provider} providerName={product.providerName} />
                  </Button>
                );
              })}
            </div>
          ) : sceneProducts.length > 0 ? (
            <>
              <Select id="provider" name="provider" defaultValue={selectedProduct?.provider}>
                {sceneProducts.map((product) => (
                  <option key={product.product} value={product.provider}>
                    {product.providerName}
                  </option>
                ))}
              </Select>
              <FieldDescription>
                当前环境：{paymentSceneName(scene)}。{sceneProducts.map((product) => product.description).join("；")}
              </FieldDescription>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-background px-3 py-3 text-sm text-muted-foreground">
              当前环境暂无可用支付方式。
            </div>
          )}
        </Field>
      </FieldGroup>
      {mode === "buttons" ? null : needsAuthorization ? (
        <Button asChild className="w-fit">
          <a href={authorizeUrl}>先授权微信支付</a>
        </Button>
      ) : (
        <Button className="w-fit" disabled={sceneProducts.length === 0 || rechargeOptions.length === 0} type="submit">
          {submitLabel}
        </Button>
      )}
    </form>
  );
}
