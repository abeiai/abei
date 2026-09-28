"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState, useTransition } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Download, Edit3, Filter, Plus, RotateCcw, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type {
  AdminTextbookListResult,
  AdminTextbookListItem,
  AdminTextbookQuery,
  TextbookFilterOption
} from "@/lib/learning-materials-api";

type ManagedTextbook = AdminTextbookListItem & {
  mdDownloadUrl: string;
  pdfDownloadUrl: string;
};

type ModalState =
  | {
      type: "create";
    }
  | {
      textbook: ManagedTextbook;
      type: "edit";
    }
  | {
      textbook: ManagedTextbook;
      type: "delete";
    };

interface TextbookManagerProps {
  filters: {
    educationTypes: TextbookFilterOption[];
    subjects: TextbookFilterOption[];
    versions: TextbookFilterOption[];
    grades: TextbookFilterOption[];
    volumes: TextbookFilterOption[];
  };
  pagination: AdminTextbookListResult["pagination"];
  query: AdminTextbookQuery;
  textbooks: ManagedTextbook[];
}

export function TextbookManager({ filters, pagination, query, textbooks }: TextbookManagerProps) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function openModal(nextModal: ModalState) {
    setMessage("");
    setModal(nextModal);
  }

  function closeModal() {
    if (!isPending) {
      setModal(null);
    }
  }

  function submitTextbook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!modal || modal.type === "delete") {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const endpoint =
      modal.type === "edit"
        ? `/api/admin/learning-materials/textbooks/${modal.textbook.id}`
        : "/api/admin/learning-materials/textbooks";

    setMessage("");
    startTransition(async () => {
      try {
        await mutationFetch(endpoint, {
          body: formData,
          method: modal.type === "edit" ? "PATCH" : "POST"
        });
        setModal(null);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "教材保存失败，请稍后重试。");
      }
    });
  }

  function submitDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!modal || modal.type !== "delete") {
      return;
    }

    setMessage("");
    startTransition(async () => {
      try {
        await mutationFetch(`/api/admin/learning-materials/textbooks/${modal.textbook.id}`, {
          method: "DELETE"
        });
        setModal(null);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "教材删除失败，请稍后重试。");
      }
    });
  }

  return (
    <>
      <Card>
        <CardHeader className="items-end">
          <Button onClick={() => openModal({ type: "create" })} type="button">
            <Plus data-icon="inline-start" />
            新增
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <TextbookFilters filters={filters} query={query} />
          <ActiveFilters filters={filters} query={query} />
          <TextbookTable onOpenModal={openModal} textbooks={textbooks} />
          <TextbookPagination pagination={pagination} query={query} />
        </CardContent>
      </Card>

      {modal?.type === "create" || modal?.type === "edit" ? (
        <TextbookFormModal
          filters={filters}
          isPending={isPending}
          message={message}
          modal={modal}
          onClose={closeModal}
          onSubmit={submitTextbook}
        />
      ) : null}

      {modal?.type === "delete" ? (
        <DeleteTextbookModal
          isPending={isPending}
          message={message}
          onClose={closeModal}
          onSubmit={submitDelete}
          textbook={modal.textbook}
        />
      ) : null}
    </>
  );
}

function TextbookPagination({
  pagination,
  query
}: {
  pagination: AdminTextbookListResult["pagination"];
  query: AdminTextbookQuery;
}) {
  if (pagination.total === 0) {
    return null;
  }

  const start = (pagination.page - 1) * pagination.pageSize + 1;
  const end = Math.min(pagination.page * pagination.pageSize, pagination.total);
  const isFirstPage = pagination.page <= 1;
  const isLastPage = pagination.page >= pagination.totalPages;

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
      <span>
        第 {start}-{end} 条，共 {pagination.total} 条，每页 {pagination.pageSize} 条
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <PaginationButton disabled={isFirstPage} href={textbookPageHref(query, 1)}>
          首页
        </PaginationButton>
        <PaginationButton disabled={isFirstPage} href={textbookPageHref(query, pagination.page - 1)}>
          <ChevronLeft data-icon="inline-start" />
          上一页
        </PaginationButton>
        <span className="px-2 text-foreground">
          {pagination.page} / {pagination.totalPages}
        </span>
        <PaginationButton disabled={isLastPage} href={textbookPageHref(query, pagination.page + 1)}>
          下一页
          <ChevronRight data-icon="inline-end" />
        </PaginationButton>
        <PaginationButton disabled={isLastPage} href={textbookPageHref(query, pagination.totalPages)}>
          末页
        </PaginationButton>
      </div>
    </div>
  );
}

function PaginationButton({
  children,
  disabled,
  href
}: {
  children: ReactNode;
  disabled: boolean;
  href: string;
}) {
  if (disabled) {
    return (
      <Button disabled size="sm" type="button" variant="outline">
        {children}
      </Button>
    );
  }

  return (
    <Button asChild size="sm" variant="outline">
      <Link href={href}>{children}</Link>
    </Button>
  );
}

function textbookPageHref(query: AdminTextbookQuery, page: number) {
  const params = new URLSearchParams();

  for (const key of ["educationType", "subject", "version", "grade"] as const) {
    const value = query[key]?.trim();

    if (value) {
      params.set(key, value);
    }
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const suffix = params.toString();

  return `/admin/learning-materials/textbooks${suffix ? `?${suffix}` : ""}`;
}

function TextbookFilters({
  filters,
  query
}: {
  filters: TextbookManagerProps["filters"];
  query: AdminTextbookQuery;
}) {
  return (
    <form
      action="/admin/learning-materials/textbooks"
      className="grid gap-3 rounded-md border border-border bg-secondary/30 p-4 lg:grid-cols-[1fr_1fr_1.4fr_1fr_auto_auto]"
    >
      <FilterSelect
        id="educationType"
        label="类型"
        name="educationType"
        options={filters.educationTypes}
        placeholder="全部类型"
        value={query.educationType}
      />
      <FilterSelect
        id="subject"
        label="学科"
        name="subject"
        options={filters.subjects}
        placeholder="全部学科"
        value={query.subject}
      />
      <FilterSelect
        id="version"
        label="版本"
        name="version"
        options={filters.versions}
        placeholder="全部版本"
        value={query.version}
      />
      <FilterSelect
        id="grade"
        label="年级"
        name="grade"
        options={filters.grades}
        placeholder="全部年级"
        value={query.grade}
      />
      <div className="flex items-end">
        <Button className="w-full" type="submit">
          <Filter data-icon="inline-start" />
          筛选
        </Button>
      </div>
      <div className="flex items-end">
        <Button asChild className="w-full" type="button" variant="outline">
          <Link href="/admin/learning-materials/textbooks">
            <RotateCcw data-icon="inline-start" />
            重置
          </Link>
        </Button>
      </div>
    </form>
  );
}

function FilterSelect({
  id,
  label,
  name,
  options,
  placeholder,
  value
}: {
  id: string;
  label: string;
  name: string;
  options: TextbookFilterOption[];
  placeholder: string;
  value?: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select defaultValue={value ?? ""} id={id} name={name}>
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function ActiveFilters({
  filters,
  query
}: {
  filters: TextbookManagerProps["filters"];
  query: AdminTextbookQuery;
}) {
  const activeFilters = [
    labelFor(filters.educationTypes, query.educationType),
    labelFor(filters.subjects, query.subject),
    labelFor(filters.versions, query.version),
    labelFor(filters.grades, query.grade)
  ].filter(Boolean);

  if (activeFilters.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {activeFilters.map((filter) => (
        <Badge key={filter} variant="outline">
          {filter}
        </Badge>
      ))}
    </div>
  );
}

function TextbookTable({
  onOpenModal,
  textbooks
}: {
  onOpenModal: (modal: ModalState) => void;
  textbooks: ManagedTextbook[];
}) {
  if (textbooks.length === 0) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        暂无符合条件的教材。
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-80">教材</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>学科</TableHead>
              <TableHead className="min-w-48">版本</TableHead>
              <TableHead>年级</TableHead>
              <TableHead>册数</TableHead>
              <TableHead>课程标准</TableHead>
              <TableHead>版本时间</TableHead>
              <TableHead className="min-w-36">下载</TableHead>
              <TableHead className="min-w-40 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {textbooks.map((textbook) => (
              <TableRow key={textbook.id}>
                <TableCell>
                  <div className="flex min-w-0 items-center gap-3">
                    <CoverPreview textbook={textbook} />
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="font-medium leading-6">{textbook.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {textbook.publisher ?? "未填写出版社"}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{textbook.educationTypeName}</Badge>
                </TableCell>
                <TableCell>{textbook.subject}</TableCell>
                <TableCell>{textbook.version}</TableCell>
                <TableCell>{textbook.grade}</TableCell>
                <TableCell>{textbook.volumeName}</TableCell>
                <TableCell>{textbook.curriculumStandardYear ? `${textbook.curriculumStandardYear}年版` : "-"}</TableCell>
                <TableCell>{textbook.editionYear ?? "-"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {textbook.hasPdf ? (
                      <Button asChild size="sm" variant="outline">
                        <a href={textbook.pdfDownloadUrl}>
                          <Download data-icon="inline-start" />
                          PDF
                        </a>
                      </Button>
                    ) : (
                      <Button disabled size="sm" type="button" variant="outline">
                        PDF
                      </Button>
                    )}
                    <Button asChild size="sm" variant="outline">
                      <a href={textbook.mdDownloadUrl}>
                        <Download data-icon="inline-start" />
                        MD
                      </a>
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button onClick={() => onOpenModal({ textbook, type: "edit" })} size="sm" type="button" variant="outline">
                      <Edit3 data-icon="inline-start" />
                      编辑
                    </Button>
                    <Button onClick={() => onOpenModal({ textbook, type: "delete" })} size="sm" type="button" variant="outline">
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
    </div>
  );
}

function TextbookFormModal({
  filters,
  isPending,
  message,
  modal,
  onClose,
  onSubmit
}: {
  filters: TextbookManagerProps["filters"];
  isPending: boolean;
  message: string;
  modal: Extract<ModalState, { type: "create" | "edit" }>;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const textbook = modal.type === "edit" ? modal.textbook : null;

  return (
    <ModalShell title={textbook ? "编辑教材" : "新增教材"} onClose={onClose} isPending={isPending}>
      <form className="grid gap-5 px-6 py-5 md:grid-cols-2" onSubmit={onSubmit}>
        <Datalist id="textbook-subject-options" options={filters.subjects} />
        <Datalist id="textbook-version-options" options={filters.versions} />
        <Datalist id="textbook-grade-options" options={filters.grades} />

        <Field className="md:col-span-2">
          <FieldLabel htmlFor="textbook-title">教材名称</FieldLabel>
          <Input
            id="textbook-title"
            name="title"
            defaultValue={textbook?.title ?? ""}
            maxLength={200}
            required
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="textbook-slug">英文别名</FieldLabel>
          <Input
            id="textbook-slug"
            name="slug"
            defaultValue={textbook?.slug ?? ""}
            maxLength={100}
            pattern="[a-z0-9-]+"
            placeholder="primary-english-grade3-first"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="textbook-education-type">类型</FieldLabel>
          <Select id="textbook-education-type" name="educationType" defaultValue={textbook?.educationType ?? "PRIMARY"}>
            {filters.educationTypes.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <FieldGroup className="md:col-span-2 md:grid md:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="textbook-subject">学科</FieldLabel>
            <Input
              id="textbook-subject"
              name="subject"
              defaultValue={textbook?.subject ?? ""}
              list="textbook-subject-options"
              maxLength={40}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="textbook-version">版本</FieldLabel>
            <Input
              id="textbook-version"
              name="version"
              defaultValue={textbook?.version ?? ""}
              list="textbook-version-options"
              maxLength={80}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="textbook-grade">年级</FieldLabel>
            <Input
              id="textbook-grade"
              name="grade"
              defaultValue={textbook?.grade ?? ""}
              list="textbook-grade-options"
              maxLength={40}
              required
            />
          </Field>
        </FieldGroup>

        <FieldGroup className="md:col-span-2 md:grid md:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="textbook-volume">册数</FieldLabel>
            <Select id="textbook-volume" name="volume" defaultValue={textbook?.volume ?? "FIRST_VOLUME"}>
              {filters.volumes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="textbook-publisher">出版社</FieldLabel>
            <Input id="textbook-publisher" name="publisher" defaultValue={textbook?.publisher ?? ""} maxLength={80} />
          </Field>
          <Field>
            <FieldLabel htmlFor="textbook-sort-order">排序</FieldLabel>
            <Input id="textbook-sort-order" name="sortOrder" defaultValue={textbook?.sortOrder ?? 100} min={0} type="number" />
          </Field>
        </FieldGroup>

        <FieldGroup className="md:col-span-2 md:grid md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="textbook-curriculum-standard-year">课程标准</FieldLabel>
            <Input
              id="textbook-curriculum-standard-year"
              name="curriculumStandardYear"
              defaultValue={textbook?.curriculumStandardYear ?? ""}
              inputMode="numeric"
              maxLength={4}
              pattern="\d{4}"
              placeholder="2022"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="textbook-edition-year">版本时间</FieldLabel>
            <Input id="textbook-edition-year" name="editionYear" defaultValue={textbook?.editionYear ?? ""} maxLength={40} />
          </Field>
        </FieldGroup>

        <Field className="md:col-span-2">
          <FieldLabel htmlFor="textbook-cover-url">封面地址</FieldLabel>
          <Input id="textbook-cover-url" name="coverUrl" defaultValue={textbook?.coverUrl ?? ""} placeholder="https://..." />
        </Field>

        <FieldGroup className="md:col-span-2 md:grid md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="textbook-pdf-url">PDF 地址</FieldLabel>
            <Input id="textbook-pdf-url" name="pdfUrl" defaultValue={textbook?.pdfUrl ?? ""} placeholder="https://..." />
            <ResourceStatus
              external={Boolean(textbook?.hasExternalPdf)}
              label="PDF"
              uploaded={Boolean(textbook?.hasUploadedPdf)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="textbook-md-url">MD 地址</FieldLabel>
            <Input id="textbook-md-url" name="mdUrl" defaultValue={textbook?.mdUrl ?? ""} placeholder="https://..." />
            <ResourceStatus
              external={Boolean(textbook?.hasExternalMd)}
              label="MD"
              uploaded={Boolean(textbook?.hasUploadedMd)}
            />
          </Field>
        </FieldGroup>

        <FieldGroup className="md:col-span-2 md:grid md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="textbook-pdf-file">PDF 文件</FieldLabel>
            <Input id="textbook-pdf-file" name="pdfFile" type="file" accept=".pdf,application/pdf" />
            <p className="text-xs text-muted-foreground">上传后将覆盖当前 PDF 资源。</p>
          </Field>
          <Field>
            <FieldLabel htmlFor="textbook-md-file">MD 文件</FieldLabel>
            <Input id="textbook-md-file" name="mdFile" type="file" accept=".md,text/markdown,text/plain" />
            <p className="text-xs text-muted-foreground">上传后将覆盖当前 MD 资源。</p>
          </Field>
        </FieldGroup>

        {textbook ? (
          <div className="flex flex-wrap gap-5 md:col-span-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input name="removePdf" type="checkbox" />
              移除 PDF
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input name="removeMd" type="checkbox" />
              移除 MD
            </label>
          </div>
        ) : null}

        {message ? <p className="text-sm text-destructive md:col-span-2">{message}</p> : null}
        <div className="flex justify-end gap-2 border-t border-border pt-5 md:col-span-2">
          <Button disabled={isPending} onClick={onClose} type="button" variant="outline">
            取消
          </Button>
          <Button disabled={isPending} type="submit">
            {isPending ? "保存中..." : textbook ? "保存修改" : "新增"}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

function DeleteTextbookModal({
  isPending,
  message,
  onClose,
  onSubmit,
  textbook
}: {
  isPending: boolean;
  message: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  textbook: ManagedTextbook;
}) {
  return (
    <ModalShell title="删除教材" onClose={onClose} isPending={isPending} size="sm">
      <form className="flex flex-col gap-5 px-6 py-5" onSubmit={onSubmit}>
        <div className="rounded-md border border-border bg-secondary/40 p-4">
          <p className="font-medium">{textbook.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {textbook.educationTypeName} / {textbook.subject} / {textbook.version} / {textbook.grade} / {textbook.volumeName}
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
    </ModalShell>
  );
}

function ModalShell({
  children,
  isPending,
  onClose,
  size = "lg",
  title
}: {
  children: ReactNode;
  isPending: boolean;
  onClose: () => void;
  size?: "lg" | "sm";
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div
        className={
          size === "sm"
            ? "w-full max-w-lg rounded-lg border border-border bg-card shadow-xl"
            : "max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto rounded-lg border border-border bg-card shadow-xl"
        }
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <h2 className="text-xl font-semibold">{title}</h2>
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
        {children}
      </div>
    </div>
  );
}

function ResourceStatus({
  external,
  label,
  uploaded
}: {
  external: boolean;
  label: string;
  uploaded: boolean;
}) {
  const text = uploaded ? "已上传文件" : external ? "已配置外链" : "未配置";

  return (
    <span className="text-xs text-muted-foreground">
      当前 {label}：{text}
    </span>
  );
}

function Datalist({ id, options }: { id: string; options: TextbookFilterOption[] }) {
  return (
    <datalist id={id}>
      {options.map((option) => (
        <option key={option.value} value={option.value} />
      ))}
    </datalist>
  );
}

function CoverPreview({ textbook }: { textbook: AdminTextbookListItem }) {
  if (textbook.coverUrl) {
    return (
      <img
        alt=""
        className="h-16 w-12 rounded-sm border border-border object-cover"
        src={textbook.coverUrl}
      />
    );
  }

  return (
    <div className="flex h-16 w-12 items-center justify-center rounded-sm border border-border bg-secondary text-muted-foreground">
      <BookOpen />
    </div>
  );
}

function labelFor(options: TextbookFilterOption[], value?: string) {
  if (!value) {
    return "";
  }

  return options.find((option) => option.value === value)?.label ?? value;
}

async function mutationFetch(input: RequestInfo | URL, init: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as { code?: number; message?: string } | null;

  if (!response.ok || payload?.code !== 0) {
    throw new Error(payload?.message || "请求失败");
  }
}
