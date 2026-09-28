"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { FileSpreadsheet, Loader2, Upload, Users, X } from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import {
  parseNameLabelRosterRows,
  parseNameLabelRosterText,
  type NameLabelRosterEntry,
} from "./name-label-roster";

const acceptedRosterFiles = ".xlsx,.xls,.csv,.txt,.docx";
const maxRosterFileSize = 10 * 1024 * 1024;

export function NameLabelRosterDialog({
  active,
  initialText,
  onApply,
  onClose,
  onExitRoster,
}: {
  active: boolean;
  initialText: string;
  onApply: (entries: NameLabelRosterEntry[], sourceText: string, filename: string) => void;
  onClose: () => void;
  onExitRoster: () => void;
}) {
  const [draft, setDraft] = useState(initialText);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const [isReading, setIsReading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const entries = useMemo(() => parseNameLabelRosterText(draft), [draft]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (file.size > maxRosterFileSize) {
      setError("名单文件不能超过 10MB。");
      return;
    }

    setIsReading(true);
    setError("");

    try {
      const result = await readRosterFile(file);

      if (result.entries.length === 0) {
        throw new Error("未识别到同时包含姓名和学号的名单数据。");
      }

      setDraft(formatRosterEditorText(result.entries));
      setFilename(file.name);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "名单文件解析失败，请检查文件内容。");
    } finally {
      setIsReading(false);
    }
  }

  function applyRoster() {
    if (entries.length === 0) {
      setError("请至少录入一名同时包含姓名和学号的学生。");
      return;
    }

    onApply(entries, draft, filename);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/30 p-4" role="presentation">
      <div
        aria-labelledby="name-label-roster-title"
        aria-modal="true"
        className="flex max-h-[min(680px,calc(100vh-32px))] w-[min(760px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
        role="dialog"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950" id="name-label-roster-title">
              <Users className="size-5 text-blue-600" />
              录入名单
            </h2>
            <p className="mt-1 text-xs font-medium text-slate-500">
              每名学生独占一页，该页所有姓名贴重复使用这名学生的姓名和学号。
            </p>
          </div>
          <button
            aria-label="关闭录入名单"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            onClick={onClose}
            type="button"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isReading}
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              {isReading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              上传名单
            </button>
            <input
              accept={acceptedRosterFiles}
              className="hidden"
              onChange={handleFileChange}
              ref={inputRef}
              type="file"
            />
            <span className="text-xs font-medium text-slate-500">支持 xlsx、xls、csv、txt、docx</span>
            {filename ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                <FileSpreadsheet className="size-3.5 shrink-0" />
                <span className="max-w-56 truncate">{filename}</span>
              </span>
            ) : null}
          </div>

          <Textarea
            aria-label="姓名贴名单"
            className="mt-4 min-h-56 resize-y font-mono text-sm leading-7"
            maxLength={50_000}
            onChange={(event) => {
              setDraft(event.target.value);
              setError("");
              setFilename("");
            }}
            placeholder={"学号\t姓名\n2026001\t张三\n2026002\t李四"}
            value={draft}
          />

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-slate-800">识别结果</span>
              <span className="text-sm font-bold text-blue-600">{entries.length} 人 / {entries.length} 页</span>
            </div>
            {entries.length > 0 ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {entries.slice(0, 8).map((entry, index) => (
                  <div className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-sm" key={`${entry.studentNumber}-${index}`}>
                    <span className="font-semibold text-slate-900">{entry.name}</span>
                    <span className="text-slate-500">{entry.studentNumber}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">可使用“学号 姓名”两列，或“姓名：张三 / 学号：2026001”格式。</p>
            )}
            {entries.length > 8 ? (
              <p className="mt-2 text-right text-xs font-medium text-slate-500">另有 {entries.length - 8} 人</p>
            ) : null}
          </div>

          {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 px-5 py-4 sm:px-6">
          {active ? (
            <button
              className="mr-auto h-10 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              onClick={onExitRoster}
              type="button"
            >
              退出名单模式
            </button>
          ) : null}
          <button
            className="h-10 rounded-lg border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          <button
            className="h-10 rounded-lg bg-[#EF1D28] px-5 text-sm font-semibold text-white shadow-sm hover:bg-[#d81923] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isReading || entries.length === 0}
            onClick={applyRoster}
            type="button"
          >
            确认录入
          </button>
        </div>
      </div>
    </div>
  );
}

async function readRosterFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (["xlsx", "xls", "csv"].includes(extension)) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const entries = workbook.SheetNames.flatMap((sheetName) => {
      const sheet = workbook.Sheets[sheetName];

      if (!sheet) {
        return [];
      }

      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        blankrows: false,
        defval: "",
        header: 1,
        raw: false,
      });

      return parseNameLabelRosterRows(rows);
    });

    return { entries };
  }

  if (extension === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });

    return { entries: parseNameLabelRosterText(result.value) };
  }

  if (extension === "txt") {
    return { entries: parseNameLabelRosterText(await file.text()) };
  }

  throw new Error("仅支持 xlsx、xls、csv、txt、docx 名单文件。");
}

function formatRosterEditorText(entries: NameLabelRosterEntry[]) {
  return ["学号\t姓名", ...entries.map((entry) => `${entry.studentNumber}\t${entry.name}`)].join("\n");
}
