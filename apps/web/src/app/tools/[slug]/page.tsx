import { redirect } from "next/navigation";

import { StreamToolForm } from "@/components/ai/stream-tool-form";
import { PublicShell } from "@/components/shell/public-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAiTool } from "@/lib/ai-api";
import { guardLearnerScenarioEntry } from "@/lib/profile-api";
import { learnerScenarioHref, normalizeLearnerScenarioRoot } from "@/lib/profile-routing";

export const dynamic = "force-dynamic";

export default async function ToolDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const path = `/tools/${encodeURIComponent(slug)}`;
  const profile = await guardLearnerScenarioEntry(path);

  if (profile.mode !== "LEARNER") {
    redirect("/tools");
  }

  const root = normalizeLearnerScenarioRoot(slug);
  const dedicatedHref = learnerScenarioHref(root);

  if (!dedicatedHref.startsWith("/tools/")) {
    redirect(dedicatedHref);
  }

  const tool = await getAiTool(root).catch(() => null);

  if (!tool) {
    redirect("/learn");
  }

  return (
    <PublicShell showFooter={false}>
      <main className="mx-auto w-full max-w-4xl px-5 py-10">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">{tool.name}</CardTitle>
            {tool.description ? <CardDescription>{tool.description}</CardDescription> : null}
          </CardHeader>
          <CardContent>
            <StreamToolForm
              placeholder="请输入学习内容"
              promptVariables={tool.promptVariables}
              scenarioId={tool.id}
            />
          </CardContent>
        </Card>
      </main>
    </PublicShell>
  );
}
