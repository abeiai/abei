export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const maxSubtitleTextBytes = 20 * 1024 * 1024;

function isAllowedSubtitleUrl(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) {
    return false;
  }

  return (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "cdn.xueleai.com" ||
    url.hostname === "xueleai.com" ||
    url.hostname.endsWith(".xueleai.com")
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";

  if (!rawUrl) {
    return Response.json(
      {
        code: 40001,
        message: "字幕地址不能为空",
        data: null
      },
      {
        status: 400
      }
    );
  }

  let subtitleUrl: URL;

  try {
    subtitleUrl = new URL(rawUrl);
  } catch {
    return Response.json(
      {
        code: 40001,
        message: "字幕地址格式不正确",
        data: null
      },
      {
        status: 400
      }
    );
  }

  if (!isAllowedSubtitleUrl(subtitleUrl)) {
    return Response.json(
      {
        code: 40001,
        message: "字幕地址不在允许的读取范围内",
        data: null
      },
      {
        status: 400
      }
    );
  }

  try {
    const response = await fetch(subtitleUrl, {
      cache: "no-store"
    });

    if (!response.ok) {
      return Response.json(
        {
          code: 50001,
          message: "字幕文件读取失败",
          data: null
        },
        {
          status: 502
        }
      );
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);

    if (contentLength > maxSubtitleTextBytes) {
      return Response.json(
        {
          code: 40001,
          message: "字幕文件不能超过 20M",
          data: null
        },
        {
          status: 400
        }
      );
    }

    const buffer = await response.arrayBuffer();

    if (buffer.byteLength > maxSubtitleTextBytes) {
      return Response.json(
        {
          code: 40001,
          message: "字幕文件不能超过 20M",
          data: null
        },
        {
          status: 400
        }
      );
    }

    return Response.json({
      code: 0,
      message: "成功",
      data: {
        text: new TextDecoder("utf-8").decode(buffer)
      }
    });
  } catch {
    return Response.json(
      {
        code: 50001,
        message: "字幕文件读取失败",
        data: null
      },
      {
        status: 502
      }
    );
  }
}
