import Link from "next/link";
import { Button } from "@/components/ui/button";

export function AiLogSourceLinks({ source }: { source: "NEW" | "LEGACY" }) {
  return <nav aria-label="日志来源" className="flex gap-2">
    <Button asChild variant={source === "NEW" ? "default" : "outline"}><Link aria-current={source === "NEW" ? "page" : undefined} href="/admin/ai-logs?source=NEW">新版日志</Link></Button>
    <Button asChild variant={source === "LEGACY" ? "default" : "outline"}><Link aria-current={source === "LEGACY" ? "page" : undefined} href="/admin/ai-logs?source=LEGACY">旧版日志</Link></Button>
  </nav>;
}
