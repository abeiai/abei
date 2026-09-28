import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TypingPracticeConsole } from "@/components/typing/typing-practice-console";
import { getOptionalCurrentUser } from "@/lib/auth-actions";
import { guardLearnerScenarioEntry } from "@/lib/profile-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "正在练习 - 打字记词 - 学乐 AI"
};

export default async function TypingPracticePage({
  params
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const path = `/typing/practice/${encodeURIComponent(sessionId)}`;
  const user = await getOptionalCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  await guardLearnerScenarioEntry(path);
  return <TypingPracticeConsole sessionId={sessionId} />;
}
