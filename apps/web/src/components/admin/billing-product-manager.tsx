"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit3, PackagePlus, Plus, Trash2, X } from "lucide-react";

import { VditorEditor } from "@/components/cms/vditor-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { RechargeProduct } from "@/lib/billing-api";
import {
  createBillingProductAction,
  deleteBillingProductAction,
  updateBillingProductAction
} from "@/lib/payment-admin-api";

type ProductModalState =
  | {
      type: "create";
    }
  | {
      product: RechargeProduct;
      type: "edit";
    }
  | {
      product: RechargeProduct;
      type: "delete";
    };

export function BillingProductManager({ products }: { products: RechargeProduct[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<ProductModalState | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function openModal(nextModal: ProductModalState) {
    setMessage("");
    setModal(nextModal);
  }

  function closeModal() {
    if (!isPending) {
      setModal(null);
    }
  }

  function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const action = modal?.type === "edit" ? updateBillingProductAction : createBillingProductAction;

    setMessage("");
    startTransition(async () => {
      try {
        await action(formData);
        setModal(null);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "产品保存失败，请稍后重试。");
      }
    });
  }

  function submitDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    setMessage("");
    startTransition(async () => {
      try {
        await deleteBillingProductAction(formData);
        setModal(null);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "产品删除失败，请稍后重试。");
      }
    });
  }

  return (
    <>
      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex size-10 items-center justify-center rounded-md bg-secondary">
              <PackagePlus />
            </div>
            <div className="flex flex-col gap-1.5">
              <CardTitle>产品列表</CardTitle>
              <CardDescription>前台价格页和用户中心充值页只展示已启用的充值模式产品。</CardDescription>
            </div>
          </div>
          <Button onClick={() => openModal({ type: "create" })} type="button">
            <Plus data-icon="inline-start" />
            新增产品
          </Button>
        </CardHeader>
        <CardContent>
          {products.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>产品名称</TableHead>
                    <TableHead>模式</TableHead>
                    <TableHead>价格</TableHead>
                    <TableHead>购买点数</TableHead>
                    <TableHead>套餐说明</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>排序</TableHead>
                    <TableHead>更新时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{product.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">{product.code}</span>
                        </div>
                      </TableCell>
                      <TableCell>{product.billingModeName}</TableCell>
                      <TableCell className="font-medium">￥{product.amountCny}</TableCell>
                      <TableCell>{product.credits.toLocaleString("zh-CN")} 点</TableCell>
                      <TableCell className="max-w-[320px] text-muted-foreground">
                        {product.description || "未填写"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={product.isEnabled ? "secondary" : "muted"}>
                          {product.isEnabled ? "已启用" : "已停用"}
                        </Badge>
                      </TableCell>
                      <TableCell>{product.sortOrder}</TableCell>
                      <TableCell>{new Date(product.updatedAt).toLocaleDateString("zh-CN")}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            onClick={() => openModal({ product, type: "edit" })}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <Edit3 data-icon="inline-start" />
                            编辑
                          </Button>
                          <Button
                            onClick={() => openModal({ product, type: "delete" })}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <Trash2 data-icon="inline-start" />
                            删除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-background p-6 text-sm text-muted-foreground">
              暂无产品，请点击右上角“新增产品”创建充值套餐。
            </div>
          )}
        </CardContent>
      </Card>

      {modal?.type === "create" || modal?.type === "edit" ? (
        <ProductFormModal
          isPending={isPending}
          message={message}
          modal={modal}
          onClose={closeModal}
          onSubmit={submitProduct}
        />
      ) : null}

      {modal?.type === "delete" ? (
        <DeleteProductModal
          isPending={isPending}
          message={message}
          onClose={closeModal}
          onSubmit={submitDelete}
          product={modal.product}
        />
      ) : null}
    </>
  );
}

function ProductFormModal({
  isPending,
  message,
  modal,
  onClose,
  onSubmit
}: {
  isPending: boolean;
  message: string;
  modal: Extract<ProductModalState, { type: "create" | "edit" }>;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const product = modal.type === "edit" ? modal.product : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div
        className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-lg border border-border bg-card shadow-xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-semibold">{product ? "编辑产品" : "新增产品"}</h2>
            <p className="text-sm text-muted-foreground">当前仅开放充值模式；订阅模式和混合模式暂不开发。</p>
          </div>
          <Button
            aria-label="关闭弹窗"
            className="size-9 px-0"
            disabled={isPending}
            onClick={onClose}
            size="sm"
            type="button"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        </div>

        <form className="grid gap-5 px-6 py-5 md:grid-cols-2" onSubmit={onSubmit}>
          {product ? <input name="id" type="hidden" value={product.id} /> : null}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="product-billing-mode">充值模式</FieldLabel>
              <Select id="product-billing-mode" name="billingMode" defaultValue={product?.billingMode ?? "RECHARGE"}>
                <option value="RECHARGE">充值模式</option>
                <option value="SUBSCRIPTION" disabled>
                  订阅模式（暂不开发）
                </option>
                <option value="MIXED" disabled>
                  混合模式（暂不开发）
                </option>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="product-code">英文别名</FieldLabel>
              <Input
                id="product-code"
                name="code"
                defaultValue={product?.code ?? ""}
                maxLength={64}
                placeholder="starter"
                required
              />
              <FieldDescription>用于前台创建订单，支持小写字母、数字和短横线。</FieldDescription>
            </Field>
          </FieldGroup>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="product-name">套餐名称</FieldLabel>
              <Input
                id="product-name"
                name="name"
                defaultValue={product?.name ?? ""}
                maxLength={40}
                placeholder="例如：团队充值包"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="product-amount">价格</FieldLabel>
              <Input
                id="product-amount"
                name="amountCny"
                defaultValue={product?.amountCny ?? ""}
                min="0.01"
                step="0.01"
                type="number"
                required
              />
            </Field>
          </FieldGroup>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="product-credits">购买点数</FieldLabel>
              <Input
                id="product-credits"
                name="credits"
                defaultValue={product?.credits ?? ""}
                min="1"
                step="1"
                type="number"
                required
              />
            </Field>
          </FieldGroup>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="product-description">套餐说明</FieldLabel>
            <Textarea
              id="product-description"
              name="description"
              defaultValue={product?.description ?? ""}
              maxLength={200}
              placeholder="说明适用场景或推荐人群"
            />
          </Field>
          <VditorEditor
            className="md:col-span-2"
            defaultValue={product?.benefitsMarkdown ?? ""}
            description="支持 Markdown，用于维护套餐权益说明。"
            label="套餐权益"
            minHeight={260}
            name="benefitsMarkdown"
            placeholder={"- 权益一\n- 权益二"}
          />
          <Field>
            <FieldLabel htmlFor="product-sort-order">排序</FieldLabel>
            <Input id="product-sort-order" name="sortOrder" defaultValue={product?.sortOrder ?? 100} type="number" />
            <FieldDescription>数值越小越靠前。</FieldDescription>
          </Field>
          <Field className="justify-end">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input name="isEnabled" type="checkbox" defaultChecked={product?.isEnabled ?? true} />
              启用
            </label>
          </Field>
          {message ? <p className="text-sm text-destructive md:col-span-2">{message}</p> : null}
          <div className="flex justify-end gap-2 border-t border-border pt-5 md:col-span-2">
            <Button disabled={isPending} onClick={onClose} type="button" variant="outline">
              取消
            </Button>
            <Button disabled={isPending} type="submit">
              {isPending ? "保存中..." : product ? "保存修改" : "新增产品"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteProductModal({
  isPending,
  message,
  onClose,
  onSubmit,
  product
}: {
  isPending: boolean;
  message: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  product: RechargeProduct;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card shadow-xl" role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-semibold">删除产品</h2>
            <p className="text-sm text-muted-foreground">如果产品已有支付订单引用，系统会阻止删除。</p>
          </div>
          <Button
            aria-label="关闭弹窗"
            className="size-9 px-0"
            disabled={isPending}
            onClick={onClose}
            size="sm"
            type="button"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        </div>
        <form className="flex flex-col gap-5 px-6 py-5" onSubmit={onSubmit}>
          <input name="id" type="hidden" value={product.id} />
          <div className="rounded-lg border border-border bg-secondary/40 p-4">
            <p className="font-medium">{product.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              ￥{product.amountCny} / {product.credits.toLocaleString("zh-CN")} 点
            </p>
          </div>
          {message ? <p className="text-sm text-destructive">{message}</p> : null}
          <div className="flex justify-end gap-2 border-t border-border pt-5">
            <Button disabled={isPending} onClick={onClose} type="button" variant="outline">
              取消
            </Button>
            <Button disabled={isPending} type="submit" variant="outline">
              <Trash2 data-icon="inline-start" />
              {isPending ? "删除中..." : "确认删除"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
