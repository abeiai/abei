import Link from "next/link";
import { Database, FileText, Upload } from "lucide-react";

import { DashboardShell } from "@/components/shell/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getCurrentUser } from "@/lib/auth-actions";
import {
  createKnowledgeBaseAction,
  getKnowledgeBase,
  getKnowledgeBases,
  uploadKnowledgeDocumentAction
} from "@/lib/knowledge-api";
import { requireAccountProfile } from "@/lib/profile-api";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false
  });
}

export default async function KnowledgePage({
  searchParams
}: {
  searchParams: Promise<{ base?: string }>;
}) {
  const params = await searchParams;
  await requireAccountProfile("/dashboard/knowledge");
  await getCurrentUser();
  const bases = await getKnowledgeBases();
  const selectedBaseId = params.base ?? bases[0]?.id;
  const selectedBase = selectedBaseId ? await getKnowledgeBase(selectedBaseId).catch(() => null) : null;

  return (
    <DashboardShell active="knowledge" continuation="/dashboard/knowledge">
      <section className="flex w-full flex-col gap-8 px-5 py-8">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardHeader>
              <div className="flex size-10 items-center justify-center rounded-md bg-secondary">
                <Database />
              </div>
              <CardTitle>创建知识库</CardTitle>
              <CardDescription>每个用户只能查看和检索自己的知识库。</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createKnowledgeBaseAction} className="flex flex-col gap-5">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="name">名称</FieldLabel>
                    <Input id="name" name="name" placeholder="运营资料库" required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="description">描述</FieldLabel>
                    <Textarea id="description" name="description" placeholder="用于存放产品介绍、FAQ 和内容资料" rows={4} />
                  </Field>
                </FieldGroup>
                <Button className="w-fit" type="submit">创建知识库</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex size-10 items-center justify-center rounded-md bg-secondary">
                <Upload />
              </div>
              <CardTitle>上传解析文件</CardTitle>
              <CardDescription>文件大小默认限制 5MB，不支持的文件会返回中文提示。</CardDescription>
            </CardHeader>
            <CardContent>
              {selectedBase ? (
                <form action={uploadKnowledgeDocumentAction} className="flex flex-col gap-5">
                  <input name="baseId" type="hidden" value={selectedBase.id} />
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="file">文件</FieldLabel>
                      <Input id="file" name="file" type="file" accept=".txt,.md,.pdf,.docx" required />
                      <FieldDescription>当前知识库：{selectedBase.name}</FieldDescription>
                    </Field>
                  </FieldGroup>
                  <Button className="w-fit" type="submit">上传并解析</Button>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">请先创建一个知识库。</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader>
              <CardTitle>知识库列表</CardTitle>
              <CardDescription>选择一个知识库查看文档和切块。</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {bases.length > 0 ? (
                bases.map((base) => (
                  <Link
                    className="rounded-md border border-border bg-background p-4 text-sm"
                    href={`/dashboard/knowledge?base=${base.id}`}
                    key={base.id}
                  >
                    <span className="font-medium">{base.name}</span>
                    <span className="mt-1 block text-muted-foreground">
                      {base.documents.length.toLocaleString("zh-CN")} 个文档
                    </span>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">暂无知识库。</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{selectedBase?.name ?? "文档列表"}</CardTitle>
              <CardDescription>{selectedBase?.description ?? "创建知识库后上传文件。"}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {selectedBase?.documents.length ? (
                selectedBase.documents.map((document) => (
                  <div className="rounded-md border border-border bg-background p-4" key={document.id}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <FileText />
                        <div>
                          <p className="font-medium">{document.filename}</p>
                          <p className="text-xs text-muted-foreground">
                            {document.statusName} · {document.chunks.length} 个切块 · {formatDate(document.createdAt)}
                          </p>
                        </div>
                      </div>
                      <Badge variant={document.status === "READY" ? "secondary" : "outline"}>
                        {document.statusName}
                      </Badge>
                    </div>
                    {document.errorMessage ? (
                      <p className="mt-3 text-sm text-destructive">{document.errorMessage}</p>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">暂无文档。</p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </DashboardShell>
  );
}
