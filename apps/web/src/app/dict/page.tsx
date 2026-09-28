import Link from "next/link";
import type { Metadata } from "next";
import { BookOpenText, Database, ExternalLink, Search } from "lucide-react";

import { PublicShell } from "@/components/shell/public-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchPublicDictionary, type PublicDictionaryEntry, type PublicDictionarySearchResult } from "@/lib/dict-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "英汉词典 - 学乐 AI",
  description: "基于 ECDICT 的本地英汉双向词典查询入口。"
};

const examples = ["test", "study", "学习", "学校"];

export default async function DictPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const query = String((await searchParams).q ?? "").trim();
  let result: PublicDictionarySearchResult | null = null;
  let error = "";

  if (query) {
    try {
      result = await searchPublicDictionary(query);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "词典服务暂不可用";
    }
  }

  return (
    <PublicShell>
      <main className="min-h-[calc(100vh-4.5rem)] bg-[#f6f6f5] px-5 py-6 text-foreground">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-2xl border border-border bg-background p-5 shadow-sm">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <BookOpenText className="size-6" />
                  <h1 className="text-2xl font-semibold tracking-normal">英汉词典</h1>
                </div>
                <form className="flex gap-2" action="/dict">
                  <Input
                    aria-label="输入英文单词或中文释义"
                    autoComplete="off"
                    className="h-11 text-base"
                    defaultValue={query}
                    name="q"
                    placeholder="输入英文单词或中文释义"
                  />
                  <Button className="h-11 shrink-0" type="submit">
                    <Search data-icon="inline-start" />
                    查询
                  </Button>
                </form>
              </div>

              {error ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive">
                  {error}
                </div>
              ) : null}

              {!query && !error ? <EmptyDictionaryState /> : null}
              {result ? <DictionaryResult result={result} /> : null}
            </div>
          </section>

          <aside className="rounded-2xl border border-border bg-background p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Database className="size-5" />
              <h2 className="text-base font-semibold">词库状态</h2>
            </div>
            <dl className="mt-5 grid gap-4 text-sm">
              <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                <dt className="font-semibold">来源</dt>
                <dd>
                  <a
                    className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                    href={result?.source.repositoryUrl ?? "https://github.com/skywind3000/ecdict"}
                    rel="noreferrer"
                    target="_blank"
                  >
                    ECDICT
                    <ExternalLink className="size-3.5" />
                  </a>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                <dt className="font-semibold">本地存储</dt>
                <dd className="text-muted-foreground">PostgreSQL</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="font-semibold">词条数量</dt>
                <dd className="font-medium">{result ? result.totalEntries.toLocaleString("zh-CN") : "查询后显示"}</dd>
              </div>
            </dl>
          </aside>
        </div>
      </main>
    </PublicShell>
  );
}

function EmptyDictionaryState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-secondary/30 p-5">
      <div className="text-sm font-semibold text-muted-foreground">试查单词或释义</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {examples.map((word) => (
          <Button asChild key={word} size="sm" variant="outline">
            <Link href={`/dict?q=${encodeURIComponent(word)}`}>{word}</Link>
          </Button>
        ))}
      </div>
    </div>
  );
}

function DictionaryResult({ result }: { result: PublicDictionarySearchResult }) {
  if (!result.exact && result.suggestions.length === 0) {
    return (
      <div className="rounded-xl border border-border p-5">
        <h2 className="text-base font-semibold">未找到匹配词条</h2>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {result.exact ? <DictionaryEntryPanel entry={result.exact} /> : null}
      {result.suggestions.length > 0 ? (
        <section className="rounded-xl border border-border p-5">
          <h2 className="text-base font-semibold">{dictionarySuggestionTitle(result)}</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {result.suggestions.map((entry) => (
              <Link
                className="rounded-xl border border-border px-4 py-3 transition-colors hover:bg-secondary"
                href={`/dict?q=${encodeURIComponent(entry.word)}`}
                key={entry.id}
              >
                <span className="block text-sm font-medium">{entry.word}</span>
                {entry.translationLines[0] ? (
                  <span className="mt-1 line-clamp-1 block text-xs text-muted-foreground">{entry.translationLines[0]}</span>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function dictionarySuggestionTitle(result: PublicDictionarySearchResult) {
  if (result.queryMode === "translation") {
    return "中文释义匹配";
  }

  return result.exact ? "相关词条" : "相近词条";
}

function DictionaryEntryPanel({ entry }: { entry: PublicDictionaryEntry }) {
  return (
    <article className="rounded-xl border border-border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-normal">{entry.word}</h2>
          {entry.phonetic ? <p className="mt-1 text-sm text-muted-foreground">/{entry.phonetic}/</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {entry.oxford ? <Badge variant="secondary">牛津</Badge> : null}
          {entry.collins ? <Badge variant="outline">柯林斯 {entry.collins}</Badge> : null}
          {entry.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="outline">{tag}</Badge>
          ))}
        </div>
      </div>

      {entry.translationLines.length > 0 ? (
        <section className="mt-5">
          <h3 className="text-sm font-semibold">释义</h3>
          <ul className="mt-2 grid gap-2 text-base leading-8">
            {entry.translationLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {entry.definitionLines.length > 0 ? (
        <section className="mt-5">
          <h3 className="text-sm font-semibold">英文解释</h3>
          <ul className="mt-2 grid gap-2 text-sm leading-6 text-muted-foreground">
            {entry.definitionLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {entry.exchanges.length > 0 ? (
        <section className="mt-5">
          <h3 className="text-sm font-semibold">词形变化</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {entry.exchanges.map((item) => (
              <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground" key={`${item.label}-${item.value}`}>
                {item.label}：{item.value}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
