import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { HttpStatus, Injectable } from "@nestjs/common";
import { getPrismaClient, type Prisma } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import {
  AgentToolRunDto,
  CreateKnowledgeBaseDto,
  SearchKnowledgeDto
} from "./dto/advanced-ai.dto.js";

interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class AdvancedAiService {
  private readonly prisma = getPrismaClient();

  async listKnowledgeBases(userId: string) {
    const bases = await this.prisma.knowledgeBase.findMany({
      where: {
        userId
      },
      include: {
        documents: {
          orderBy: {
            createdAt: "desc"
          },
          take: 5
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return bases.map((base) => this.toKnowledgeBase(base));
  }

  async createKnowledgeBase(userId: string, dto: CreateKnowledgeBaseDto) {
    const base = await this.prisma.knowledgeBase.create({
      data: {
        userId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null
      },
      include: {
        documents: true
      }
    });

    return this.toKnowledgeBase(base);
  }

  async getKnowledgeBase(userId: string, id: string) {
    const base = await this.prisma.knowledgeBase.findFirst({
      where: {
        id,
        userId
      },
      include: {
        documents: {
          include: {
            chunks: {
              orderBy: {
                sortOrder: "asc"
              }
            }
          },
          orderBy: {
            createdAt: "desc"
          }
        }
      }
    });

    if (!base) {
      throw new AppException(40401, "知识库不存在", HttpStatus.NOT_FOUND);
    }

    return this.toKnowledgeBase(base);
  }

  async uploadKnowledgeDocument(userId: string, knowledgeBaseId: string, file: UploadedFileLike | undefined) {
    if (!file) {
      throw new AppException(40001, "请选择要解析的文件", HttpStatus.BAD_REQUEST);
    }

    this.assertKnowledgeFile(file);
    await this.ensureKnowledgeBaseOwner(userId, knowledgeBaseId);

    const document = await this.prisma.knowledgeDocument.create({
      data: {
        knowledgeBaseId,
        filename: file.originalname,
        mimeType: file.mimetype || mimeTypeByName(file.originalname),
        size: file.size,
        status: "PROCESSING"
      }
    });

    try {
      const contentText = extractDocumentText(file).slice(0, maxKnowledgeTextLength());
      const chunks = chunkText(contentText);

      if (chunks.length === 0) {
        throw new AppException(40001, "文件未提取到有效文本", HttpStatus.BAD_REQUEST);
      }

      const updated = await this.prisma.knowledgeDocument.update({
        where: {
          id: document.id
        },
        data: {
          status: "READY",
          contentText,
          chunks: {
            create: chunks.map((content, index) => ({
              content,
              sortOrder: index,
              embeddingId: createEmbeddingId(content)
            }))
          }
        },
        include: {
          chunks: {
            orderBy: {
              sortOrder: "asc"
            }
          }
        }
      });

      return this.toKnowledgeDocument(updated);
    } catch (error) {
      const message = error instanceof AppException ? error.message : "文件解析失败";
      const failed = await this.prisma.knowledgeDocument.update({
        where: {
          id: document.id
        },
        data: {
          status: "FAILED",
          errorMessage: message
        },
        include: {
          chunks: true
        }
      });

      if (error instanceof AppException) {
        throw error;
      }

      return this.toKnowledgeDocument(failed);
    }
  }

  async searchKnowledgeBase(userId: string, knowledgeBaseId: string, dto: SearchKnowledgeDto) {
    await this.ensureKnowledgeBaseOwner(userId, knowledgeBaseId);
    const words = keywordTokens(dto.query);
    const chunks = await this.prisma.knowledgeChunk.findMany({
      where: {
        document: {
          knowledgeBaseId,
          status: "READY"
        }
      },
      include: {
        document: true
      },
      orderBy: {
        sortOrder: "asc"
      },
      take: 200
    });

    return chunks
      .map((chunk) => ({
        id: chunk.id,
        documentId: chunk.documentId,
        filename: chunk.document.filename,
        content: chunk.content,
        sortOrder: chunk.sortOrder,
        score: scoreText(chunk.content, words)
      }))
      .filter((chunk) => chunk.score > 0)
      .sort((first, second) => second.score - first.score || first.sortOrder - second.sortOrder)
      .slice(0, 8);
  }

  async runAgentTool(userId: string, dto: AgentToolRunDto) {
    const toolName = dto.toolName.trim();
    const input = isPlainRecord(dto.input) ? dto.input : {};

    try {
      if (!isPlainRecord(dto.input)) {
        throw new AppException(40001, "工具参数不能为空", HttpStatus.BAD_REQUEST);
      }

      const output = await this.executeAgentTool(userId, toolName, input);
      const log = await this.prisma.aiToolCall.create({
        data: {
          userId,
          toolName,
          input: input as Prisma.InputJsonValue,
          output: output as Prisma.InputJsonValue,
          success: true
        }
      });

      return {
        ...log,
        output
      };
    } catch (error) {
      const message = error instanceof AppException ? error.message : "工具调用失败";
      await this.prisma.aiToolCall.create({
        data: {
          userId,
          toolName,
          input: input as Prisma.InputJsonValue,
          success: false,
          errorMessage: message
        }
      });
      throw error instanceof AppException
        ? error
        : new AppException(40001, message, HttpStatus.BAD_REQUEST);
    }
  }

  private async ensureKnowledgeBaseOwner(userId: string, knowledgeBaseId: string) {
    const base = await this.prisma.knowledgeBase.findFirst({
      where: {
        id: knowledgeBaseId,
        userId
      },
      select: {
        id: true
      }
    });

    if (!base) {
      throw new AppException(40401, "知识库不存在", HttpStatus.NOT_FOUND);
    }
  }

  private assertKnowledgeFile(file: UploadedFileLike) {
    if (file.size <= 0 || file.size > maxKnowledgeUploadBytes()) {
      throw new AppException(40001, `文件大小不能超过 ${Math.floor(maxKnowledgeUploadBytes() / 1024 / 1024)}MB`, HttpStatus.BAD_REQUEST);
    }

    if (!allowedKnowledgeFile(file)) {
      throw new AppException(40001, "仅支持 txt、md、pdf、docx 文件", HttpStatus.BAD_REQUEST);
    }
  }

  private async executeAgentTool(userId: string, toolName: string, input: Record<string, unknown>) {
    if (toolName === "current_time") {
      const now = new Date();

      return {
        iso: now.toISOString(),
        zhCN: now.toLocaleString("zh-CN", {
          hour12: false,
          timeZone: "Asia/Shanghai"
        })
      };
    }

    if (toolName === "calculate") {
      return {
        result: calculateExpression(String(input.expression ?? ""))
      };
    }

    if (toolName === "site_article_search") {
      const query = String(input.query ?? "").trim();

      if (!query) {
        throw new AppException(40001, "请输入文章查询关键词", HttpStatus.BAD_REQUEST);
      }

      const articles = await this.prisma.article.findMany({
        where: {
          status: "PUBLISHED",
          OR: [
            {
              title: {
                contains: query,
                mode: "insensitive"
              }
            },
            {
              summary: {
                contains: query,
                mode: "insensitive"
              }
            },
            {
              content: {
                contains: query,
                mode: "insensitive"
              }
            }
          ]
        },
        select: {
          title: true,
          slug: true,
          summary: true
        },
        take: 5
      });

      return {
        articles
      };
    }

    if (toolName === "user_task_search") {
      const query = String(input.query ?? "").trim().toLowerCase();
      const tasks = await this.prisma.aiTask.findMany({
        where: {
          userId
        },
        include: {
          scenario: true
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 50
      });

      return {
        tasks: tasks
          .filter((task) => {
            const text = [
              task.scenario.name,
              JSON.stringify(task.input),
              task.output ?? "",
              task.errorMessage ?? ""
            ].join("\n").toLowerCase();

            return !query || text.includes(query);
          })
          .slice(0, 8)
          .map((task) => ({
            id: task.id,
            scenarioName: task.scenario.name,
            status: task.status,
            createdAt: task.createdAt,
            output: task.output?.slice(0, 240) ?? null
          }))
      };
    }

    throw new AppException(40001, "不支持的工具调用", HttpStatus.BAD_REQUEST);
  }

  private toKnowledgeBase(base: {
    id: string;
    userId: string;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
    documents?: Array<{
      id: string;
      filename: string;
      mimeType: string;
      size: number;
      status: string;
      contentText: string | null;
      errorMessage: string | null;
      createdAt: Date;
      updatedAt: Date;
      chunks?: Array<{ id: string; content: string; sortOrder: number }>;
    }>;
  }) {
    return {
      id: base.id,
      userId: base.userId,
      name: base.name,
      description: base.description,
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
      documents: base.documents?.map((document) => this.toKnowledgeDocument(document)) ?? []
    };
  }

  private toKnowledgeDocument(document: {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    status: string;
    contentText: string | null;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
    chunks?: Array<{ id: string; content: string; sortOrder: number }>;
  }) {
    return {
      id: document.id,
      filename: document.filename,
      mimeType: document.mimeType,
      size: document.size,
      status: document.status,
      statusName: documentStatusName(document.status),
      contentText: document.contentText,
      errorMessage: document.errorMessage,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      chunks: document.chunks ?? []
    };
  }

}

function allowedKnowledgeFile(file: UploadedFileLike) {
  const mimeType = file.mimetype || mimeTypeByName(file.originalname);
  const name = file.originalname.toLowerCase();

  return (
    ["text/plain", "text/markdown", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(mimeType) ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".pdf") ||
    name.endsWith(".docx")
  );
}

function extractDocumentText(file: UploadedFileLike) {
  const name = file.originalname.toLowerCase();
  const mimeType = file.mimetype || mimeTypeByName(file.originalname);

  if (mimeType.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md")) {
    return normalizeExtractedText(file.buffer.toString("utf8"));
  }

  if (mimeType === "application/pdf" || name.endsWith(".pdf")) {
    return normalizeExtractedText(extractPdfText(file.buffer));
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    return normalizeExtractedText(extractDocxText(file.buffer));
  }

  throw new AppException(40001, "不支持的文件类型", HttpStatus.BAD_REQUEST);
}

function extractPdfText(buffer: Buffer) {
  const raw = buffer.toString("latin1");
  const matches = [
    ...raw.matchAll(/\((?:\\.|[^\\()])+\)\s*Tj/g),
    ...raw.matchAll(/\[(?:.|\n)*?\]\s*TJ/g)
  ];
  const text = matches
    .map((match) => match[0])
    .flatMap((segment) => [...segment.matchAll(/\(((?:\\.|[^\\()])*)\)/g)].map((item) => item[1]))
    .map((value) => value.replace(/\\([()\\])/g, "$1").replace(/\\n/g, "\n").replace(/\\r/g, "\r"))
    .join(" ");

  if (!text.trim()) {
    throw new AppException(40001, "PDF 未提取到有效文本", HttpStatus.BAD_REQUEST);
  }

  return text;
}

function extractDocxText(buffer: Buffer) {
  const xml = readZipFile(buffer, "word/document.xml")?.toString("utf8");

  if (!xml) {
    throw new AppException(40001, "DOCX 文档结构不正确", HttpStatus.BAD_REQUEST);
  }

  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/g)]
    .map((match) => decodeXml(match[1]))
    .join("");
}

function readZipFile(buffer: Buffer, filename: string) {
  const endSignature = 0x06054b50;
  let endOffset = -1;

  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (buffer.readUInt32LE(index) === endSignature) {
      endOffset = index;
      break;
    }
  }

  if (endOffset < 0) {
    return null;
  }

  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let offset = buffer.readUInt32LE(endOffset + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      return null;
    }

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const entryName = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    if (entryName === filename) {
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

      return method === 8 ? inflateRawSync(compressed) : compressed;
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return null;
}

function normalizeExtractedText(value: string) {
  return value.replaceAll(String.fromCharCode(0), "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function chunkText(value: string) {
  const normalized = normalizeExtractedText(value);
  const chunks: string[] = [];
  const size = 900;
  const overlap = 120;

  for (let start = 0; start < normalized.length; start += size - overlap) {
    const chunk = normalized.slice(start, start + size).trim();

    if (chunk.length >= 20 || normalized.length < 20) {
      chunks.push(chunk);
    }
  }

  return chunks.slice(0, 200);
}

function createEmbeddingId(content: string) {
  return createHash("sha256").update(content).digest("hex").slice(0, 24);
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function mimeTypeByName(name: string) {
  const normalized = name.toLowerCase();

  if (normalized.endsWith(".md")) {
    return "text/markdown";
  }

  if (normalized.endsWith(".pdf")) {
    return "application/pdf";
  }

  if (normalized.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  return "text/plain";
}

function keywordTokens(value: string) {
  const ascii = value
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
  const chineseChars = Array.from(value.matchAll(/[\u4e00-\u9fa5]/gu)).map((match) => match[0]);

  return Array.from(new Set([...ascii, ...chineseChars])).slice(0, 60);
}

function scoreText(value: string, words: string[]) {
  if (words.length === 0) {
    return 0;
  }

  const normalized = value.toLowerCase();

  return words.reduce((score, word) => score + (normalized.includes(word.toLowerCase()) ? 1 : 0), 0);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function calculateExpression(expression: string) {
  const normalized = expression.replace(/\s+/g, "");

  if (!/^[0-9+\-*/().%]+$/.test(normalized) || !normalized) {
    throw new AppException(40001, "只支持数字和基础四则运算", HttpStatus.BAD_REQUEST);
  }

  const result = Function(`"use strict"; return (${normalized});`)() as unknown;

  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new AppException(40001, "计算结果无效", HttpStatus.BAD_REQUEST);
  }

  return result;
}

function documentStatusName(status: string) {
  const names: Record<string, string> = {
    PROCESSING: "解析中",
    READY: "可检索",
    FAILED: "解析失败"
  };

  return names[status] ?? status;
}

function maxKnowledgeUploadBytes() {
  const value = Number(process.env.KNOWLEDGE_UPLOAD_MAX_BYTES ?? 5 * 1024 * 1024);

  return Number.isFinite(value) && value > 0 ? value : 5 * 1024 * 1024;
}

function maxKnowledgeTextLength() {
  const value = Number(process.env.KNOWLEDGE_TEXT_MAX_LENGTH ?? 200_000);

  return Number.isFinite(value) && value > 0 ? value : 200_000;
}
