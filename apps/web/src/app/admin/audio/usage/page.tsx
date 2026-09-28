import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AdminAudioUsagePage() {
  redirect("/admin/ai/usage");
}
