import { AdminTaskList } from "@/components/admin/admin-task-list";

export const dynamic = "force-dynamic";

export default async function AdminAiTasksPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  return <AdminTaskList searchParams={searchParams} />;
}
