import { headers } from "next/headers";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

export async function GET(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const requestHeaders = await headers();
  const { taskId } = await params;
  const response = await fetch(
    `${getApiBaseUrl()}/ai/video/tasks/${encodeURIComponent(taskId)}`,
    {
      headers: {
        Cookie: requestHeaders.get("cookie") ?? ""
      },
      cache: "no-store"
    }
  );

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json; charset=utf-8"
    }
  });
}
