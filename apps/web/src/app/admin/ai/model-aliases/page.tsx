import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AdminAiModelAliasesPage() {
  redirect("/admin/ai/config#default-models");
}
