"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Plus, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
  type CmsCategory
} from "@/lib/cms-api";

type CategoryModalState =
  | {
      type: "create";
    }
  | {
      category: CmsCategory;
      type: "edit";
    };

export function CategoryManager({ categories }: { categories: CmsCategory[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<CategoryModalState | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function closeModal() {
    if (!isPending) {
      setModal(null);
    }
  }

  function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const action = modal?.type === "edit" ? updateCategoryAction : createCategoryAction;

    setMessage("");
    startTransition(async () => {
      try {
        await action(formData);
        setModal(null);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "分类保存失败，请稍后重试。");
      }
    });
  }

  return (
    <>
      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2">
            <CardTitle>分类列表</CardTitle>
            <CardDescription>分类数据来自真实 CMS API。</CardDescription>
          </div>
          <Button onClick={() => setModal({ type: "create" })} type="button">
            <Plus data-icon="inline-start" />
            新增分类
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="overflow-hidden rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>分类名称</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>文章数</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>排序</TableHead>
                  <TableHead>更新时间</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium">{category.name}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{category.slug}</TableCell>
                    <TableCell>{category._count?.articles ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant={category.isVisible ? "secondary" : "muted"}>
                        {category.isVisible ? "显示" : "隐藏"}
                      </Badge>
                    </TableCell>
                    <TableCell>{category.sortOrder}</TableCell>
                    <TableCell>{new Date(category.updatedAt).toLocaleDateString("zh-CN")}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => setModal({ category, type: "edit" })} size="sm" type="button" variant="outline">
                          <Edit3 data-icon="inline-start" />
                          编辑
                        </Button>
                        <form action={deleteCategoryAction}>
                          <input name="id" type="hidden" value={category.id} />
                          <Button size="sm" type="submit" variant="outline">
                            <Trash2 data-icon="inline-start" />
                            删除
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
            <span>分页：第 1 页 / 共 1 页</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline">
                上一页
              </Button>
              <Button size="sm" variant="outline">
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {modal ? (
        <CategoryModal isPending={isPending} message={message} modal={modal} onClose={closeModal} onSubmit={submitCategory} />
      ) : null}
    </>
  );
}

function CategoryModal({
  isPending,
  message,
  modal,
  onClose,
  onSubmit
}: {
  isPending: boolean;
  message: string;
  modal: CategoryModalState;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const category = modal.type === "edit" ? modal.category : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-card shadow-xl" role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-semibold">{category ? "编辑分类" : "新增分类"}</h2>
            <p className="text-sm text-muted-foreground">slug 只能包含小写字母、数字和短横线。</p>
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
          {category ? <input name="id" type="hidden" value={category.id} /> : null}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="category-name">分类名称</FieldLabel>
              <Input id="category-name" name="name" defaultValue={category?.name ?? ""} placeholder="例如：产品设计" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="category-slug">Slug</FieldLabel>
              <Input id="category-slug" name="slug" defaultValue={category?.slug ?? ""} placeholder="product-design" required />
            </Field>
          </FieldGroup>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="category-description">分类描述</FieldLabel>
              <Input
                id="category-description"
                name="description"
                defaultValue={category?.description ?? ""}
                placeholder="用于后台识别分类用途"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="category-sort">排序值</FieldLabel>
              <Input id="category-sort" name="sortOrder" defaultValue={category?.sortOrder ?? 0} type="number" />
              <FieldDescription>
                <label className="inline-flex items-center gap-2">
                  <input defaultChecked={category?.isVisible ?? true} name="isVisible" type="checkbox" />
                  前台可见
                </label>
              </FieldDescription>
            </Field>
          </FieldGroup>
          {message ? <p className="md:col-span-2 text-sm text-destructive">{message}</p> : null}
          <div className="flex justify-end gap-2 border-t border-border pt-5 md:col-span-2">
            <Button disabled={isPending} onClick={onClose} type="button" variant="outline">
              取消
            </Button>
            <Button disabled={isPending} type="submit">
              {isPending ? "保存中..." : category ? "保存分类" : "新增分类"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
