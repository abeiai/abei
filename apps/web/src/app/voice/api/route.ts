import { headers } from "next/headers";

import {
  buildDialogueInput,
  dialogueFriendlyError,
  dialogueOperationPath,
  type DialogueInput
} from "@/lib/voice-dialogue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function failure(message: string, status = 400, code = 40001) {
  return Response.json({ code, message, data: null }, { status, headers: { "Cache-Control": "no-store" } });
}

async function forward(request: Request) {
  const url = new URL(request.url);
  const operation = url.searchParams.get("operation") ?? "";
  const path = dialogueOperationPath(operation, request.method, url.searchParams.get("projectId"));
  if (!path) return failure("不支持的语音操作或项目编号");
  let body: string | undefined;
  if (request.method === "POST" && operation !== "merge") {
    try {
      if (Number(request.headers.get("content-length") ?? 0) > 131072) return failure("语音内容过长");
      const raw = await request.text();
      if (Buffer.byteLength(raw, "utf8") > 131072) return failure("语音内容过长");
      const value = JSON.parse(raw) as Record<string, unknown>;
      if (!value || typeof value !== "object" || Array.isArray(value)) return failure("请求参数错误");
      if (operation === "generate") {
        if (typeof value.quoteId !== "string" || !/^[\w-]{1,100}$/.test(value.quoteId))
          return failure("请重新获取费用报价");
        body = JSON.stringify({ quoteId: value.quoteId });
      } else {
        if (!Array.isArray(value.speakers) || !Array.isArray(value.segments)) return failure("请求参数错误");
        if (
          value.segmentId !== undefined &&
          (typeof value.segmentId !== "string" || !/^[\w-]{1,100}$/.test(value.segmentId))
        )
          return failure("请选择有效的重合成段落");
        body = JSON.stringify(
          buildDialogueInput(
            value as DialogueInput,
            typeof value.segmentId === "string" ? { segmentId: value.segmentId } : {}
          )
        );
      }
    } catch {
      return failure("请求参数错误，请检查语音内容");
    }
  }
  const incoming = await headers();
  const forwarded = new Headers({ "Content-Type": "application/json" });
  // The selected profile is carried by the existing signed profile-context cookie.
  for (const name of ["cookie", "authorization"]) {
    const value = incoming.get(name);
    if (value) forwarded.set(name, value);
  }
  try {
    const response = await fetch(`${process.env.API_BASE_URL ?? "http://localhost:3322/api"}${path}`, {
      method: request.method,
      headers: forwarded,
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(20000)])
    });
    const payload = (await response.json().catch(() => null)) as {
      code: number;
      message: string;
      data: unknown;
    } | null;
    if (!payload || typeof payload.code !== "number") return failure("语音服务暂时不可用，请稍后重试", 502, 50002);
    if (!response.ok || payload.code !== 0)
      return failure(
        dialogueFriendlyError(payload.message),
        response.ok ? 400 : response.status,
        payload.code || 50002
      );
    if (payload.data === null || payload.data === undefined) return failure("语音服务返回异常，请稍后重试", 502, 50002);
    return Response.json(
      { code: 0, message: "成功", data: payload.data },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return failure("语音服务暂时无法连接，请稍后重试", 502, 50002);
  }
}

export async function GET(request: Request) {
  return forward(request);
}
export async function POST(request: Request) {
  return forward(request);
}
