"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Bot,
  Brain,
  Check,
  ChevronDown,
  CirclePlus,
  Clipboard,
  FileText,
  Film,
  ImageIcon,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Send,
  Sparkles,
  Square,
  Upload,
  X
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/markdown/markdown-content";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PublicUser } from "@/lib/auth-actions";
import type { ExperienceChatModel } from "@/lib/experience-api";
import type { UserOrganizationsResult } from "@/lib/organizations-api";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoningContent?: string;
  attachments?: ChatAttachment[];
  usage?: ChatTokenUsage;
}

interface ChatAttachment {
  id: string;
  name: string;
  type: "image" | "document" | "audio" | "video";
  mimeType: string;
  size: number;
  previewUrl?: string;
}

interface PendingChatAttachment extends ChatAttachment {
  file: File;
}

interface RequestChatAttachment extends ChatAttachment {
  dataUrl?: string;
}

interface ChatTokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  consumedCredits?: number | null;
  modelName?: string | null;
}

interface AiChatConsoleProps {
  currentUser: PublicUser | null;
  initialOrganizationId?: string;
  models: ExperienceChatModel[];
  organizations: UserOrganizationsResult | null;
}

interface StreamChatResult {
  ok: boolean;
  message?: string;
}

interface StreamChatEvent {
  type?: string;
  text?: string;
  reasoningText?: string;
  message?: string;
  task?: {
    statusName?: string;
    modelName?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
    actualCredits?: number | null;
  };
}

interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  modelId: string;
}

const chatHistoryLimit = 30;
const maxPendingAttachments = 6;
const maxInlineMediaBytes = 8 * 1024 * 1024;
const acceptedDocumentTypes = [
  ".pdf",
  ".doc",
  ".docx",
  ".txt",
  ".md",
  ".csv",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown"
].join(",");
const attachmentCapabilityTags = ["VISION", "MULTIMODAL", "IMAGE", "IMAGE_INPUT", "FILE", "DOCUMENT", "AUDIO_INPUT", "VIDEO_INPUT"];
const reasoningCapabilityTags = ["REASONING"];
const searchCapabilityTags = ["SEARCH", "WEB_SEARCH", "BROWSING", "TOOLS"];

export function AiChatConsole({ currentUser, initialOrganizationId = "", models, organizations }: AiChatConsoleProps) {
  const normalizedModels = useMemo(() => (models.length > 0 ? models : []), [models]);
  const [selectedModelId, setSelectedModelId] = useState(normalizedModels[0]?.id ?? "mock");
  const availableOrganizations = useMemo(
    () => (organizations?.enabled ? organizations.organizations.filter((organization) => organization.memberStatus === "ACTIVE") : []),
    [organizations]
  );
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(initialOrganizationId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("选择模型后输入问题，即可开始体验。");
  const [isPending, setIsPending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingChatAttachment[]>([]);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [reasoningEnabled, setReasoningEnabled] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [expandedReasoningMessageIds, setExpandedReasoningMessageIds] = useState<Set<string>>(() => new Set());
  const abortRef = useRef<AbortController | null>(null);
  const skipNextHistoryPersistRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const userHasScrolledAwayRef = useRef(false);
  const pendingAttachmentsRef = useRef<PendingChatAttachment[]>([]);
  const copyResetTimerRef = useRef<number | null>(null);
  const historyStorageKey = useMemo(
    () => `xueleai:experience-chat-history:${currentUser?.id ?? "guest"}`,
    [currentUser?.id]
  );

  const selectedModel = useMemo(
    () => normalizedModels.find((model) => model.id === selectedModelId) ?? normalizedModels[0],
    [normalizedModels, selectedModelId]
  );
  const selectedModelCapabilities = useMemo(
    () => new Set((selectedModel?.capabilityTags ?? []).map((tag) => tag.toUpperCase())),
    [selectedModel]
  );
  const supportsAttachments = hasAnyCapability(selectedModelCapabilities, attachmentCapabilityTags);
  const supportsImageInput = hasAnyCapability(selectedModelCapabilities, ["VISION", "MULTIMODAL", "IMAGE", "IMAGE_INPUT"]);
  const supportsDocumentInput = hasAnyCapability(selectedModelCapabilities, ["VISION", "MULTIMODAL", "FILE", "DOCUMENT"]);
  const supportsAudioInput = selectedModelCapabilities.has("AUDIO_INPUT");
  const supportsVideoInput = selectedModelCapabilities.has("VIDEO_INPUT");
  const supportsReasoning = hasAnyCapability(selectedModelCapabilities, reasoningCapabilityTags);
  const supportsSearch = hasAnyCapability(selectedModelCapabilities, searchCapabilityTags);
  const canSubmit = (input.trim().length >= 2 || pendingAttachments.length > 0) && !isPending;
  const billingContext = selectedOrganizationId ? "ORGANIZATION" : "PERSONAL";

  useEffect(() => {
    setSelectedOrganizationId(initialOrganizationId);
  }, [initialOrganizationId]);

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  useEffect(() => {
    if (!selectedOrganizationId) {
      return;
    }

    if (!availableOrganizations.some((organization) => organization.id === selectedOrganizationId)) {
      setSelectedOrganizationId("");
    }
  }, [availableOrganizations, selectedOrganizationId]);

  useEffect(() => {
    resizeComposerTextarea();
  }, [input]);

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    return scheduleMessagesScrollToBottom(isPending ? "auto" : "smooth");
  }, [isPending, messages]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) {
        window.clearTimeout(copyResetTimerRef.current);
      }
      pendingAttachmentsRef.current.forEach(revokeAttachmentPreview);
    };
  }, []);

  useEffect(() => {
    setReasoningEnabled(false);
    setSearchEnabled(false);
    clearPendingAttachments();
    setAttachmentMenuOpen(false);
  }, [selectedModelId]);

  useEffect(() => {
    const storedConversations = readChatConversations(historyStorageKey);
    const latestConversation = storedConversations[0];

    setConversations(storedConversations);
    setActiveConversationId(latestConversation?.id ?? null);
    skipNextHistoryPersistRef.current = Boolean(latestConversation);
    setMessages(latestConversation?.messages ?? []);

    if (latestConversation?.modelId && normalizedModels.some((model) => model.id === latestConversation.modelId)) {
      setSelectedModelId(latestConversation.modelId);
    } else {
      setSelectedModelId(normalizedModels[0]?.id ?? "mock");
    }

    setStatus(latestConversation ? "已加载最近对话。" : "选择模型后输入问题，即可开始体验。");
    userHasScrolledAwayRef.current = false;

    return scheduleMessagesScrollToBottom("auto", true);
  }, [historyStorageKey, normalizedModels]);

  useEffect(() => {
    if (!activeConversationId || messages.length === 0) {
      return;
    }

    if (skipNextHistoryPersistRef.current) {
      skipNextHistoryPersistRef.current = false;
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setConversations((current) => {
        const now = new Date().toISOString();
        const existing = current.find((conversation) => conversation.id === activeConversationId);
        const conversation: ChatConversation = {
          id: activeConversationId,
          title: conversationTitle(messages),
          messages,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          modelId: selectedModelId
        };
        const next = [conversation, ...current.filter((item) => item.id !== activeConversationId)].slice(0, chatHistoryLimit);

        writeChatConversations(historyStorageKey, next);
        return next;
      });
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [activeConversationId, historyStorageKey, messages, selectedModelId]);

  function resizeComposerTextarea() {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    const minHeight = 48;
    const maxHeight = Math.max(120, Math.floor(window.innerHeight * 0.5) - 180);

    textarea.style.height = "auto";
    textarea.style.maxHeight = `${maxHeight}px`;
    textarea.style.height = `${Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight))}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }

  function handleMessagesScroll() {
    const container = messagesScrollRef.current;

    if (!container) {
      return;
    }

    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

    userHasScrolledAwayRef.current = distanceToBottom > 120;
  }

  function scrollMessagesToBottom(behavior: ScrollBehavior = "smooth", force = false) {
    if (!force && userHasScrolledAwayRef.current) {
      return;
    }

    const container = messagesScrollRef.current;

    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior
    });
  }

  function scheduleMessagesScrollToBottom(behavior: ScrollBehavior = "smooth", force = false) {
    let secondFrameId: number | null = null;
    const firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => scrollMessagesToBottom(behavior, force));
    });

    return () => {
      window.cancelAnimationFrame(firstFrameId);

      if (secondFrameId !== null) {
        window.cancelAnimationFrame(secondFrameId);
      }
    };
  }

  function startNewChat() {
    abortRef.current?.abort();
    abortRef.current = null;
    userHasScrolledAwayRef.current = false;
    skipNextHistoryPersistRef.current = false;
    setActiveConversationId(null);
    setMessages([]);
    setExpandedReasoningMessageIds(new Set());
    setInput("");
    clearPendingAttachments();
    setAttachmentMenuOpen(false);
    setIsPending(false);
    setStatus("已开启新对话。");
  }

  function loadConversation(conversation: ChatConversation) {
    abortRef.current?.abort();
    abortRef.current = null;
    userHasScrolledAwayRef.current = false;
    skipNextHistoryPersistRef.current = true;
    setActiveConversationId(conversation.id);
    setMessages(conversation.messages);
    setExpandedReasoningMessageIds(new Set());
    setSelectedModelId(
      normalizedModels.some((model) => model.id === conversation.modelId)
        ? conversation.modelId
        : normalizedModels[0]?.id ?? "mock"
    );
    setInput("");
    clearPendingAttachments();
    setAttachmentMenuOpen(false);
    setIsPending(false);
    setStatus("已加载历史对话。");
    scheduleMessagesScrollToBottom("auto", true);
  }

  function appendAssistantDelta(text: string) {
    setMessages((current) => {
      const next = [...current];
      const last = next.at(-1);

      if (!last || last.role !== "assistant") {
        return [
          ...next,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: text
          }
        ];
      }

      next[next.length - 1] = {
        ...last,
        content: `${last.content}${text}`
      };
      return next;
    });
  }

  function appendAssistantReasoningDelta(text: string) {
    setMessages((current) => {
      const next = [...current];
      const last = next.at(-1);

      if (!last || last.role !== "assistant") {
        return [
          ...next,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "",
            reasoningContent: text
          }
        ];
      }

      next[next.length - 1] = {
        ...last,
        reasoningContent: `${last.reasoningContent ?? ""}${text}`
      };
      return next;
    });
  }

  function replaceLastAssistantContent(content: string) {
    setMessages((current) => {
      const next = [...current];
      const last = next.at(-1);

      if (!last || last.role !== "assistant") {
        return [
          ...next,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content
          }
        ];
      }

      next[next.length - 1] = {
        ...last,
        content,
        usage: undefined
      };
      return next;
    });
  }

  function setLastAssistantUsage(usage: ChatTokenUsage) {
    setMessages((current) => {
      const next = [...current];
      const last = next.at(-1);

      if (!last || last.role !== "assistant") {
        return next;
      }

      next[next.length - 1] = {
        ...last,
        usage
      };
      return next;
    });
  }

  function toggleReasoning(messageId: string) {
    setExpandedReasoningMessageIds((current) => {
      const next = new Set(current);

      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }

      return next;
    });
  }

  function clearPendingAttachments(options?: { revoke?: boolean }) {
    setPendingAttachments((current) => {
      if (options?.revoke !== false) {
        current.forEach(revokeAttachmentPreview);
      }

      return [];
    });
  }

  function removePendingAttachment(id: string) {
    setPendingAttachments((current) => {
      const attachment = current.find((item) => item.id === id);

      if (attachment) {
        revokeAttachmentPreview(attachment);
      }

      return current.filter((item) => item.id !== id);
    });
  }

  function openAttachmentPicker() {
    fileInputRef.current?.click();
    setAttachmentMenuOpen(false);
  }

  function handleAttachmentInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    const availableSlots = Math.max(0, maxPendingAttachments - pendingAttachmentsRef.current.length);

    if (availableSlots === 0) {
      setStatus(`每轮最多上传 ${maxPendingAttachments} 个文件。`);
      return;
    }

    const acceptedAttachments: PendingChatAttachment[] = [];
    let rejectedCount = 0;
    let inlineMediaBytes = pendingAttachmentsRef.current.reduce(
      (total, attachment) => total + (attachment.type === "document" ? 0 : attachment.size),
      0
    );

    for (const file of files) {
      const attachment = createPendingAttachment(file);

      if (!attachment || (attachment.type === "image" && !supportsImageInput) ||
        (attachment.type === "document" && !supportsDocumentInput) ||
        (attachment.type === "audio" && !supportsAudioInput) ||
        (attachment.type === "video" && !supportsVideoInput) ||
        (attachment.type !== "document" && inlineMediaBytes + attachment.size > maxInlineMediaBytes)) {
        rejectedCount += 1;
        continue;
      }

      if (attachment.type !== "document") inlineMediaBytes += attachment.size;
      acceptedAttachments.push(attachment);
    }

    const nextAttachments = acceptedAttachments.slice(0, availableSlots);

    acceptedAttachments.slice(availableSlots).forEach(revokeAttachmentPreview);

    if (nextAttachments.length > 0) {
      setPendingAttachments((current) => [...current, ...nextAttachments]);
      setStatus(`已添加 ${nextAttachments.length} 个附件。`);
    }

    if (rejectedCount > 0) {
      setStatus("部分附件不受当前模型支持；图片、音频和视频合计不超过 8 MB。");
    } else if (acceptedAttachments.length > availableSlots) {
      setStatus(`每轮最多上传 ${maxPendingAttachments} 个文件，超出部分已忽略。`);
    }
  }

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    const content = input.trim() || (pendingAttachments.length > 0 ? "请分析上传的文件。" : "");

    if (!canSubmit || !content) {
      return;
    }

    const attachments = pendingAttachments.map(toChatAttachment);
    let requestAttachments: RequestChatAttachment[];

    try {
      requestAttachments = await Promise.all(pendingAttachments.map(toRequestAttachment));
    } catch {
      setStatus("读取图片附件失败，请重新选择文件后再试。");
      return;
    }

    const requestInput = buildRequestInput(content, attachments);
    const conversationId = activeConversationId ?? crypto.randomUUID();
    const nextMessages: ChatMessage[] = [
      ...messages,
      {
        id: crypto.randomUUID(),
        role: "user",
        content,
        ...(attachments.length > 0 ? { attachments } : {})
      },
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: ""
      }
    ];
    const history = messages.slice(-12).map((message) => ({
      role: message.role,
      content: messageContentForHistory(message)
    }));
    const controller = new AbortController();

    abortRef.current = controller;
    userHasScrolledAwayRef.current = false;
    skipNextHistoryPersistRef.current = false;
    setActiveConversationId(conversationId);
    setMessages(nextMessages);
    setInput("");
    clearPendingAttachments({
      revoke: false
    });
    setAttachmentMenuOpen(false);
    setIsPending(true);
    setStatus(`${selectedModel?.displayName ?? "当前模型"} 正在生成...`);
    scheduleMessagesScrollToBottom("auto", true);

    async function streamWithModel(modelId: string): Promise<StreamChatResult> {
      const modelName =
        normalizedModels.find((model) => model.id === modelId)?.displayName ??
        (modelId === "mock" ? "本地演示模型" : "当前模型");
      let receivedText = false;

      setStatus(`${modelName} 正在生成...`);

      const response = await fetch("/api/ai/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          input: requestInput,
          modelInstanceId: modelId,
          billingContext,
          ...(selectedOrganizationId ? { organizationId: selectedOrganizationId } : {}),
          reasoningEnabled: supportsReasoning ? reasoningEnabled : false,
          searchEnabled: supportsSearch ? searchEnabled : false,
          messages: history,
          ...(requestAttachments.length > 0 ? { attachments: requestAttachments } : {})
        }),
        signal: controller.signal
      });

      if (!response.ok || !response.body) {
        return {
          ok: false,
          message: response.status === 401 ? "请先登录后再体验 AI 对话。" : "AI 对话暂时不可用，请稍后再试。"
        };
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, {
          stream: true
        });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part
            .split("\n")
            .find((item) => item.startsWith("data:"))
            ?.replace(/^data:\s*/, "");

          if (!line) {
            continue;
          }

          let eventData: StreamChatEvent;

          try {
            eventData = JSON.parse(line) as StreamChatEvent;
          } catch {
            continue;
          }

          if (eventData.type === "delta" && eventData.text) {
            receivedText = true;
            appendAssistantDelta(eventData.text);
          }

          if (eventData.type === "reasoning_delta" && eventData.text) {
            appendAssistantReasoningDelta(eventData.text);
          }

          if (eventData.type === "done") {
            const consumedCredits = normalizedTokenCount(eventData.task?.actualCredits);

            setLastAssistantUsage({
              inputTokens: normalizedTokenCount(eventData.task?.inputTokens),
              outputTokens: normalizedTokenCount(eventData.task?.outputTokens),
              totalTokens: normalizedTokenCount(eventData.task?.totalTokens),
              consumedCredits,
              modelName: eventData.task?.modelName ?? null
            });
            setStatus(eventData.task?.statusName ?? "对话完成");
            return {
              ok: true
            };
          }

          if (eventData.type === "error" || eventData.type === "cancelled") {
            return {
              ok: false,
              message: eventData.message ?? "生成失败，请稍后再试。"
            };
          }
        }
      }

      return {
        ok: receivedText,
        message: receivedText ? undefined : "AI 对话暂时不可用，请稍后再试。"
      };
    }

    try {
      const result = await streamWithModel(selectedModelId);

      if (!result.ok) {
        const message = result.message ?? "AI 对话暂时不可用，请稍后再试。";

        replaceLastAssistantContent(message);
        setStatus(message);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setStatus("已停止本次生成。");
      } else {
        replaceLastAssistantContent("AI 对话暂时不可用，请稍后再试。");
        setStatus("AI 对话暂时不可用，请稍后再试。");
      }
    } finally {
      setIsPending(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  async function copyAssistantMarkdown(message: ChatMessage) {
    const content = message.content.trim();

    if (!content) {
      return;
    }

    try {
      await copyTextToClipboard(content);
      setCopiedMessageId(message.id);
      setStatus("已复制 Markdown 回复内容。");

      if (copyResetTimerRef.current) {
        window.clearTimeout(copyResetTimerRef.current);
      }

      copyResetTimerRef.current = window.setTimeout(() => {
        setCopiedMessageId((current) => (current === message.id ? null : current));
      }, 1800);
    } catch {
      setStatus("复制失败，请稍后重试。");
    }
  }

  return (
    <main
      className={cn(
        "grid h-[calc(100vh-4rem)] min-h-0 w-full overflow-hidden bg-background",
        sidebarCollapsed
          ? "grid-cols-[72px_minmax(0,1fr)]"
          : "grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)]"
      )}
    >
      <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-border bg-card">
        <div className={cn("flex h-16 items-center px-4", sidebarCollapsed ? "justify-center" : "justify-between")}>
          {sidebarCollapsed ? (
            <Button
              aria-label="展开历史对话"
              onClick={() => setSidebarCollapsed(false)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <PanelLeftOpen />
            </Button>
          ) : (
            <>
              <Link className="flex min-w-0 items-center gap-2 font-display text-2xl font-light" href="/experience/chat">
                <MessageCircle className="text-primary" />
                <span className="truncate">AI 对话</span>
              </Link>
              <Button
                aria-label="收起历史对话"
                onClick={() => setSidebarCollapsed(true)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <PanelLeftClose />
              </Button>
            </>
          )}
        </div>
        <div className="px-4 py-3">
          <Button
            aria-label="开启新对话"
            className={cn("w-full", sidebarCollapsed ? "px-0" : "")}
            onClick={startNewChat}
            type="button"
            variant="outline"
          >
            <CirclePlus data-icon="inline-start" />
            {sidebarCollapsed ? null : "开启新对话"}
          </Button>
        </div>
        {sidebarCollapsed ? (
          <>
            <div className="flex flex-1 flex-col items-center gap-3 px-3 py-5 text-muted-foreground">
              <Search />
              <MessageCircle />
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-5">
              <div className="flex flex-col gap-2">
                <p className="px-2 text-xs font-medium text-muted-foreground">历史记录</p>
                {conversations.length > 0 ? (
                  conversations.map((conversation) => (
                    <button
                      className={cn(
                        "flex min-h-11 flex-col justify-center rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-secondary",
                        conversation.id === activeConversationId ? "bg-secondary text-foreground" : "text-muted-foreground"
                      )}
                      key={conversation.id}
                      onClick={() => loadConversation(conversation)}
                      type="button"
                    >
                      <span className="w-full truncate">{conversation.title}</span>
                      <span className="mt-1 text-xs text-muted-foreground">{formatConversationTime(conversation.updatedAt)}</span>
                    </button>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm leading-6 text-muted-foreground">
                    暂无历史记录，发送第一条消息后会自动保存。
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </aside>

      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <header className="flex min-h-16 shrink-0 items-center justify-end border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {currentUser && availableOrganizations.length > 0 ? (
              <label className="flex min-w-0 text-sm md:w-64">
                <Select value={selectedOrganizationId} onChange={(event) => setSelectedOrganizationId(event.target.value)}>
                  <option value="">个人空间</option>
                  {availableOrganizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </Select>
              </label>
            ) : null}
            <label className="flex min-w-0 text-sm md:w-80">
              <Select value={selectedModelId} onChange={(event) => setSelectedModelId(event.target.value)}>
                {normalizedModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName} · {model.providerName}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            ref={messagesScrollRef}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6 md:px-8"
            data-chat-scroll-container
            onScroll={handleMessagesScroll}
          >
            {messages.length === 0 ? (
              <div className="mx-auto flex min-h-[52vh] max-w-3xl flex-col items-center justify-center gap-7 text-center">
                <div className="flex items-center gap-3 text-2xl font-medium">
                  <Bot className="text-primary" />
                  使用快速模式开始对话
                </div>
                <div className="flex rounded-full border border-border bg-card p-1">
                  <span className="inline-flex h-10 items-center gap-2 rounded-full bg-secondary px-5 text-sm font-medium text-foreground">
                    <Sparkles />
                    快速模式
                  </span>
                  <span className="inline-flex h-10 items-center gap-2 px-5 text-sm font-medium text-muted-foreground">
                    <Brain />
                    专家模式
                  </span>
                </div>
                <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                  当前是第一版基础对话体验，支持选择已启用模型，也保留本地演示模型用于无 Provider 配置时验证流程。
                </p>
              </div>
            ) : (
              <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-7">
                <div aria-hidden="true" className="mt-auto shrink-0" />
                {messages.map((message, index) => (
                  <div
                    className={cn(
                      "flex w-full min-w-0",
                      message.role === "user" ? "justify-end" : "justify-start"
                    )}
                    key={message.id}
                  >
                    <div
                      className={cn(
                        "flex min-w-0 flex-col gap-2",
                        message.role === "assistant" ? "w-full" : "max-w-[min(72%,720px)]"
                      )}
                    >
                      <div
                        className={cn(
                          "min-w-0 rounded-2xl px-5 py-3 text-sm leading-7 md:text-base",
                          message.role === "user"
                            ? "bg-secondary text-foreground"
                            : "w-full bg-card text-foreground md:px-7 md:py-6"
                        )}
                      >
                        {message.role === "assistant" ? (
                          <div className="flex flex-col gap-4">
                            {message.reasoningContent ? (
                              <ReasoningPanel
                                content={message.reasoningContent}
                                expanded={expandedReasoningMessageIds.has(message.id)}
                                isStreaming={isPending && index === messages.length - 1 && !message.content}
                                onToggle={() => toggleReasoning(message.id)}
                              />
                            ) : null}
                            {message.content ? (
                              <MarkdownContent
                                content={message.content}
                                isStreaming={isPending && index === messages.length - 1}
                              />
                            ) : isPending && index === messages.length - 1 && !message.reasoningContent ? (
                              <GeneratingIndicator />
                            ) : null}
                          </div>
                        ) : message.role === "user" ? (
                          <div className="flex flex-col gap-3">
                            {message.attachments?.length ? (
                              <div className="flex flex-wrap justify-end gap-2">
                                {message.attachments.map((attachment) => (
                                  <AttachmentCard attachment={attachment} compact key={attachment.id} />
                                ))}
                              </div>
                            ) : null}
                            <span className="whitespace-pre-wrap">{message.content}</span>
                          </div>
                        ) : null}
                      </div>
                      {message.role === "assistant" && message.content && message.usage ? (
                        <div className="flex items-center justify-between gap-3 px-2 text-xs text-muted-foreground">
                          <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
                            <span>Input tokens：{formatTokenCount(message.usage.inputTokens)}</span>
                            <span>Output tokens：{formatTokenCount(message.usage.outputTokens)}</span>
                            <span>Total：{formatTokenCount(message.usage.totalTokens)}</span>
                            {message.usage.modelName ? <span>模型：{message.usage.modelName}</span> : null}
                            {typeof message.usage.consumedCredits === "number" ? (
                              <span>消耗点数：{formatCreditCount(message.usage.consumedCredits)}</span>
                            ) : null}
                          </div>
                          <Button
                            aria-label="复制 Markdown 回复"
                            className="size-8 shrink-0 px-0 text-muted-foreground hover:text-foreground"
                            onClick={() => void copyAssistantMarkdown(message)}
                            size="sm"
                            title="复制 Markdown 回复"
                            type="button"
                            variant="ghost"
                          >
                            {copiedMessageId === message.id ? <Check /> : <Clipboard />}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} aria-hidden="true" className="h-1 shrink-0" data-chat-scroll-end />
              </div>
            )}
          </div>

          <div className="shrink-0 bg-background px-5 pb-3 pt-1">
            <form className="mx-auto flex w-full max-w-6xl flex-col gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-sm" onSubmit={submit}>
              <input
                ref={fileInputRef}
                accept={[...(supportsImageInput ? ["image/*"] : []), ...(supportsDocumentInput ? [acceptedDocumentTypes] : []), ...(supportsAudioInput ? ["audio/*"] : []), ...(supportsVideoInput ? ["video/*"] : [])].join(",")}
                className="hidden"
                multiple
                onChange={handleAttachmentInputChange}
                type="file"
              />
              {pendingAttachments.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {pendingAttachments.map((attachment) => (
                    <AttachmentCard
                      attachment={attachment}
                      key={attachment.id}
                      onRemove={() => removePendingAttachment(attachment.id)}
                    />
                  ))}
                </div>
              ) : null}
              <Textarea
                ref={textareaRef}
                className="max-h-[50vh] min-h-12 resize-none overflow-hidden border-0 bg-transparent px-0 py-0 leading-6 shadow-none focus:border-transparent focus:ring-0"
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="给 AI SaaS 发送消息"
                value={input}
              />
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  {supportsAttachments ? (
                    <div className="relative">
                      <Button
                        aria-expanded={attachmentMenuOpen}
                        aria-haspopup="menu"
                        aria-label="添加图片或文件"
                        className="size-9 px-0"
                        onClick={() => setAttachmentMenuOpen((open) => !open)}
                        size="sm"
                        title="添加附件"
                        type="button"
                        variant="ghost"
                      >
                        <Plus />
                      </Button>
                      {attachmentMenuOpen ? (
                        <div className="absolute bottom-11 left-0 z-20 min-w-48 rounded-xl border border-border bg-card p-1 shadow-lg">
                          <button
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary"
                            onClick={openAttachmentPicker}
                            role="menuitem"
                            type="button"
                          >
                            <Upload />
                            上传附件
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {supportsAttachments && (supportsReasoning || supportsSearch) ? (
                    <span className="h-6 w-px bg-border" aria-hidden="true" />
                  ) : null}
                  {supportsReasoning ? (
                    <Button
                      aria-pressed={reasoningEnabled}
                      className={cn(
                        "h-8 px-3",
                        reasoningEnabled ? "border-primary bg-primary/5 text-primary hover:bg-primary/10" : ""
                      )}
                      onClick={() => setReasoningEnabled((enabled) => !enabled)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Brain data-icon="inline-start" />
                      深度思考
                    </Button>
                  ) : null}
                  {supportsSearch ? (
                    <Button
                      aria-pressed={searchEnabled}
                      className={cn(
                        "h-8 px-3",
                        searchEnabled ? "border-primary bg-primary/5 text-primary hover:bg-primary/10" : ""
                      )}
                      onClick={() => setSearchEnabled((enabled) => !enabled)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Search data-icon="inline-start" />
                      联网搜索
                    </Button>
                  ) : null}
                </div>
                <div className="flex items-center justify-between gap-3 md:justify-end">
                  <p className="truncate text-xs text-muted-foreground">{status}</p>
                  {isPending ? (
                    <Button onClick={stop} size="sm" type="button">
                      <Square data-icon="inline-start" />
                      停止
                    </Button>
                  ) : (
                    <Button disabled={!canSubmit} size="sm" type="submit">
                      <Send data-icon="inline-start" />
                      发送
                    </Button>
                  )}
                </div>
              </div>
              {status.includes("登录") ? (
                <Button asChild className="w-fit" size="sm" variant="outline">
                  <Link href="/login?next=/experience/chat">去登录</Link>
                </Button>
              ) : null}
            </form>
            <p className="mt-2 text-center text-xs text-muted-foreground">内容由 AI 生成，请仔细甄别</p>
          </div>
        </div>
      </div>
    </main>
  );
}

function ReasoningPanel({
  content,
  expanded,
  isStreaming,
  onToggle
}: {
  content: string;
  expanded: boolean;
  isStreaming: boolean;
  onToggle: () => void;
}) {
  const trimmedContent = content.trim();
  const shouldCollapse = trimmedContent.length > 180;
  const visibleContent = expanded || !shouldCollapse ? trimmedContent : reasoningPreview(trimmedContent);

  return (
    <section className="rounded-xl border border-dashed border-border bg-secondary/45 px-4 py-3 text-sm text-muted-foreground">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <Brain className={cn("size-4", isStreaming ? "animate-pulse text-primary" : "text-muted-foreground")} />
          {isStreaming ? "正在思考" : "思考过程"}
        </div>
        {shouldCollapse ? (
          <button
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
            onClick={onToggle}
            type="button"
          >
            {expanded ? "收起" : "更多"}
            <ChevronDown className={cn("size-3 transition-transform", expanded ? "rotate-180" : "")} />
          </button>
        ) : null}
      </div>
      {expanded ? (
        <MarkdownContent className="text-muted-foreground" content={visibleContent} />
      ) : (
        <p className="line-clamp-3 whitespace-pre-wrap leading-6">{visibleContent}</p>
      )}
    </section>
  );
}

function GeneratingIndicator() {
  return (
    <div className="inline-flex items-center gap-2 text-muted-foreground">
      <span className="relative flex size-4">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/30" />
        <span className="relative inline-flex size-4 rounded-full bg-primary/70" />
      </span>
      <span>正在生成回答</span>
      <span className="flex gap-1" aria-hidden="true">
        <span className="size-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.2s]" />
        <span className="size-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.1s]" />
        <span className="size-1 animate-bounce rounded-full bg-muted-foreground" />
      </span>
    </div>
  );
}

function reasoningPreview(content: string) {
  const normalizedContent = content.replace(/\s+/g, " ").trim();

  if (normalizedContent.length <= 180) {
    return normalizedContent;
  }

  return `...${normalizedContent.slice(-180)}`;
}

function normalizedTokenCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function hasAnyCapability(tags: Set<string>, candidates: string[]) {
  return candidates.some((tag) => tags.has(tag));
}

function createPendingAttachment(file: File): PendingChatAttachment | null {
  const type = inferAttachmentType(file);

  if (!type) {
    return null;
  }

  return {
    id: crypto.randomUUID(),
    name: file.name.trim() || "未命名文件",
    type,
    mimeType: file.type || inferMimeType(file.name, type),
    size: file.size,
    previewUrl: type === "image" ? URL.createObjectURL(file) : undefined,
    file
  };
}

function inferAttachmentType(file: File): ChatAttachment["type"] | null {
  const lowerName = file.name.toLowerCase();

  if (file.type.startsWith("audio/") || (/\.(aac|m4a|mp3|ogg|wav)$/.test(lowerName) && !file.type.startsWith("video/"))) {
    return "audio";
  }

  if (file.type.startsWith("video/") || /\.(mkv|mov|mp4|webm)$/.test(lowerName)) {
    return "video";
  }

  if (
    file.type.startsWith("image/") ||
    /\.(avif|bmp|gif|heic|heif|jpeg|jpg|png|svg|webp)$/.test(lowerName)
  ) {
    return "image";
  }

  if (
    documentMimeTypes.has(file.type) ||
    /\.(csv|doc|docx|md|pdf|ppt|pptx|txt|xls|xlsx)$/.test(lowerName)
  ) {
    return "document";
  }

  return null;
}

const documentMimeTypes = new Set([
  "application/msword",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/markdown",
  "text/plain"
]);

function inferMimeType(fileName: string, type: ChatAttachment["type"]) {
  const lowerName = fileName.toLowerCase();

  if (type === "image") {
    return "image/*";
  }

  if (type === "audio") {
    if (lowerName.endsWith(".wav")) return "audio/wav";
    if (lowerName.endsWith(".m4a")) return "audio/mp4";
    if (lowerName.endsWith(".ogg")) return "audio/ogg";
    if (lowerName.endsWith(".aac")) return "audio/aac";
    return "audio/mpeg";
  }

  if (type === "video") {
    if (lowerName.endsWith(".webm")) return "video/webm";
    if (lowerName.endsWith(".mov")) return "video/quicktime";
    if (lowerName.endsWith(".mkv")) return "video/x-matroska";
    return "video/mp4";
  }

  if (lowerName.endsWith(".pdf")) {
    return "application/pdf";
  }

  if (lowerName.endsWith(".doc") || lowerName.endsWith(".docx")) {
    return "application/msword";
  }

  if (lowerName.endsWith(".xls") || lowerName.endsWith(".xlsx")) {
    return "application/vnd.ms-excel";
  }

  if (lowerName.endsWith(".ppt") || lowerName.endsWith(".pptx")) {
    return "application/vnd.ms-powerpoint";
  }

  return "text/plain";
}

function revokeAttachmentPreview(attachment: ChatAttachment) {
  if (attachment.previewUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(attachment.previewUrl);
  }
}

function toChatAttachment(attachment: PendingChatAttachment): ChatAttachment {
  return {
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    mimeType: attachment.mimeType,
    size: attachment.size,
    previewUrl: attachment.previewUrl
  };
}

async function toRequestAttachment(attachment: PendingChatAttachment): Promise<RequestChatAttachment> {
  const baseAttachment = toChatAttachment(attachment);

  if (attachment.type === "document" || attachment.size > maxInlineMediaBytes) {
    return baseAttachment;
  }

  return {
    ...baseAttachment,
    dataUrl: await readFileAsDataUrl(attachment.file)
  };
}

function buildRequestInput(content: string, attachments: ChatAttachment[]) {
  if (attachments.length === 0) {
    return content.slice(0, 2000);
  }

  const attachmentContext = [
    "",
    "本轮用户上传的附件：",
    ...attachments.map(
      (attachment, index) =>
        `${index + 1}. ${attachment.name}（${formatAttachmentTypeLabel(attachment)}，${formatFileSize(attachment.size)}）`
    ),
    "请优先结合可读取的附件内容回答；如果某个附件无法解析，再说明需要补充的具体内容。"
  ].join("\n");

  return `${content}${attachmentContext}`.slice(0, 2000);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("读取文件失败"));
      }
    };
    reader.readAsDataURL(file);
  });
}

function messageContentForHistory(message: ChatMessage) {
  if (!message.attachments?.length) {
    return message.content;
  }

  const attachmentSummary = message.attachments
    .map((attachment) => `${attachment.name}（${formatAttachmentTypeLabel(attachment)}，${formatFileSize(attachment.size)}）`)
    .join("；");

  return `${message.content}\n附件：${attachmentSummary}`;
}

function formatTokenCount(value: number | null) {
  return typeof value === "number" ? value.toLocaleString("zh-CN") : "0";
}

function formatCreditCount(value: number | null | undefined) {
  return typeof value === "number" ? value.toLocaleString("zh-CN") : "0";
}

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");

  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

function conversationTitle(messages: ChatMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user")?.content.trim();
  const fallbackMessage = messages.find((message) => message.content.trim().length > 0)?.content.trim();
  const title = (firstUserMessage || fallbackMessage || "新对话").replace(/\s+/g, " ");

  return title.length > 32 ? `${title.slice(0, 32)}...` : title;
}

function formatConversationTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "刚刚";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function readChatConversations(storageKey: string) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);

    if (!rawValue) {
      return [];
    }

    const parsedValue: unknown = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .map((item) => normalizeChatConversation(item))
      .filter((item): item is ChatConversation => Boolean(item))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, chatHistoryLimit);
  } catch {
    return [];
  }
}

function writeChatConversations(storageKey: string, conversations: ChatConversation[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(conversations.slice(0, chatHistoryLimit)));
  } catch {
    // localStorage may be unavailable in private mode or quota-limited contexts.
  }
}

function normalizeChatConversation(value: unknown): ChatConversation | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" && record.id.trim() ? record.id : null;
  const messages = Array.isArray(record.messages)
    ? record.messages.map((item) => normalizeChatMessage(item)).filter((item): item is ChatMessage => Boolean(item))
    : [];

  if (!id || messages.length === 0) {
    return null;
  }

  const updatedAt = normalizedDateString(record.updatedAt);
  const createdAt = normalizedDateString(record.createdAt) ?? updatedAt ?? new Date().toISOString();

  return {
    id,
    title:
      typeof record.title === "string" && record.title.trim()
        ? record.title.trim().slice(0, 60)
        : conversationTitle(messages),
    messages,
    createdAt,
    updatedAt: updatedAt ?? createdAt,
    modelId: typeof record.modelId === "string" && record.modelId.trim() ? record.modelId : "mock"
  };
}

function normalizeChatMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const role = record.role === "user" || record.role === "assistant" ? record.role : null;
  const content = typeof record.content === "string" ? record.content : null;

  if (!role || content === null) {
    return null;
  }

  const usage = normalizeChatTokenUsage(record.usage);
  const attachments = Array.isArray(record.attachments)
    ? record.attachments.map((item) => normalizeChatAttachment(item)).filter((item): item is ChatAttachment => Boolean(item))
    : [];

  return {
    id: typeof record.id === "string" && record.id.trim() ? record.id : crypto.randomUUID(),
    role,
    content,
    ...(typeof record.reasoningContent === "string" && record.reasoningContent.trim()
      ? { reasoningContent: record.reasoningContent }
      : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(usage ? { usage } : {})
  };
}

function normalizeChatAttachment(value: unknown): ChatAttachment | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const type = record.type === "image" || record.type === "document" ? record.type : null;
  const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : null;
  const mimeType = typeof record.mimeType === "string" && record.mimeType.trim() ? record.mimeType.trim() : "";
  const size = normalizedTokenCount(record.size) ?? 0;

  if (!type || !name) {
    return null;
  }

  const previewUrl =
    typeof record.previewUrl === "string" && record.previewUrl.trim() && !record.previewUrl.startsWith("blob:")
      ? record.previewUrl.trim()
      : undefined;

  return {
    id: typeof record.id === "string" && record.id.trim() ? record.id.trim() : crypto.randomUUID(),
    name,
    type,
    mimeType,
    size,
    ...(previewUrl ? { previewUrl } : {})
  };
}

function normalizeChatTokenUsage(value: unknown): ChatTokenUsage | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;

  return {
    inputTokens: normalizedTokenCount(record.inputTokens),
    outputTokens: normalizedTokenCount(record.outputTokens),
    totalTokens: normalizedTokenCount(record.totalTokens),
    consumedCredits: normalizedTokenCount(record.consumedCredits),
    modelName: typeof record.modelName === "string" ? record.modelName : null
  };
}

function normalizedDateString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function AttachmentCard({
  attachment,
  compact = false,
  onRemove
}: {
  attachment: ChatAttachment;
  compact?: boolean;
  onRemove?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-xl bg-secondary px-3 py-2 text-left",
        compact ? "max-w-[260px]" : "w-full max-w-[280px]"
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background text-muted-foreground">
        {attachment.type === "image" && attachment.previewUrl ? (
          <img alt="" className="size-full object-cover" src={attachment.previewUrl} />
        ) : attachment.type === "image" ? (
          <ImageIcon />
        ) : attachment.type === "audio" ? (
          <AudioLines />
        ) : attachment.type === "video" ? (
          <Film />
        ) : (
          <FileText />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{attachment.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {formatAttachmentTypeLabel(attachment)} · {formatFileSize(attachment.size)}
        </span>
      </span>
      {onRemove ? (
        <Button
          aria-label={`移除 ${attachment.name}`}
          className="size-7 px-0 text-muted-foreground hover:text-foreground"
          onClick={onRemove}
          size="sm"
          type="button"
          variant="ghost"
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}

function formatAttachmentTypeLabel(attachment: ChatAttachment) {
  if (attachment.type === "image") {
    return "图片";
  }
  if (attachment.type === "audio") return "音频";
  if (attachment.type === "video") return "视频";

  const lowerName = attachment.name.toLowerCase();

  if (lowerName.endsWith(".pdf") || attachment.mimeType === "application/pdf") {
    return "PDF";
  }

  if (lowerName.endsWith(".doc") || lowerName.endsWith(".docx")) {
    return "Word";
  }

  if (lowerName.endsWith(".xls") || lowerName.endsWith(".xlsx")) {
    return "表格";
  }

  if (lowerName.endsWith(".ppt") || lowerName.endsWith(".pptx")) {
    return "演示文稿";
  }

  return "文档";
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return "0 KB";
  }

  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
