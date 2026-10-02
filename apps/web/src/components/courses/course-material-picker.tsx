"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from "react";
import { createPortal } from "react-dom";
import { Check, Plus, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { courseMaterialDirectoryLabel } from "@/lib/course-editor-state";
import type { CourseMaterialOption, CourseMaterialType } from "@/lib/course-types";
import { cn } from "@/lib/utils";

const materialGroups: ReadonlyArray<{
  label: string;
  type: CourseMaterialType;
}> = [
  { type: "VIDEO_GUIDE", label: "视频导学" },
  { type: "ENGLISH_GUIDED_STUDY", label: "英文带读" },
  { type: "LEARNING_FLASHCARD", label: "学习闪卡" },
  { type: "PICTURE_BOOK", label: "绘本" }
];

export const courseMaterialLimit = 200;

export function courseMaterialKey(materialType: CourseMaterialType, materialId: string) {
  return `${materialType}:${materialId}`;
}

export function filterCourseMaterialOptions(
  options: CourseMaterialOption[],
  filters: { keyword: string; materialType: "" | CourseMaterialType }
) {
  const keyword = filters.keyword.trim().toLowerCase();

  return options.filter((option) => {
    if (filters.materialType && option.materialType !== filters.materialType) {
      return false;
    }

    return !keyword || `${option.title} ${option.subtitle}`.toLowerCase().includes(keyword);
  });
}

export function toggleCourseMaterialSelection(
  selectedKeys: string[],
  key: string,
  selectedMaterialKeys: ReadonlySet<string>,
  limit: number
) {
  if (selectedMaterialKeys.has(key)) {
    return selectedKeys;
  }

  if (selectedKeys.includes(key)) {
    return selectedKeys.filter((item) => item !== key);
  }

  return selectedKeys.length >= limit ? selectedKeys : [...selectedKeys, key];
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function CourseMaterialPicker({
  disabled = false,
  onAdd,
  options,
  selectedMaterialKeys
}: {
  disabled?: boolean;
  onAdd: (options: CourseMaterialOption[]) => void;
  options: CourseMaterialOption[];
  selectedMaterialKeys: ReadonlySet<string>;
}) {
  const [open, setOpen] = useState(false);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);

  function openPicker(event: ReactMouseEvent<HTMLButtonElement>) {
    returnFocusRef.current = event.currentTarget;
    setOpen(true);
  }

  const closePicker = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => returnFocusRef.current?.focus());
  }, []);

  return (
    <>
      <Button disabled={disabled} onClick={openPicker} size="sm" type="button">
        <Plus />
        添加课件
      </Button>
      {open ? (
        <CourseMaterialPickerDialog
          onAdd={onAdd}
          onClose={closePicker}
          options={options}
          selectedMaterialKeys={selectedMaterialKeys}
        />
      ) : null}
    </>
  );
}

function CourseMaterialPickerDialog({
  onAdd,
  onClose,
  options,
  selectedMaterialKeys
}: {
  onAdd: (options: CourseMaterialOption[]) => void;
  onClose: () => void;
  options: CourseMaterialOption[];
  selectedMaterialKeys: ReadonlySet<string>;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [materialType, setMaterialType] = useState<"" | CourseMaterialType>("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const remainingSlots = Math.max(0, courseMaterialLimit - selectedMaterialKeys.size);
  const filteredOptions = useMemo(
    () => filterCourseMaterialOptions(options, { keyword, materialType }),
    [keyword, materialType, options]
  );

  useEffect(() => {
    setPortalReady(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (portalReady) searchInputRef.current?.focus();
  }, [portalReady]);

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((element) => element.offsetParent !== null);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (!first || !last) {
      event.preventDefault();
      dialogRef.current?.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function confirmSelection() {
    const optionByKey = new Map(
      options.map((option) => [courseMaterialKey(option.materialType, option.materialId), option])
    );
    const selectedOptions = selectedKeys.flatMap((key) => {
      const option = optionByKey.get(key);
      return option ? [option] : [];
    });

    if (selectedOptions.length > 0) {
      onAdd(selectedOptions);
      onClose();
    }
  }

  if (!portalReady) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        aria-labelledby="course-material-picker-title"
        aria-modal="true"
        className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-xl font-semibold" id="course-material-picker-title">添加课件</h2>
            <p className="mt-1 text-sm text-muted-foreground">从自己制作的课件中选择</p>
          </div>
          <Button aria-label="关闭添加课件" className="size-10 px-0" onClick={onClose} type="button" variant="ghost">
            <X className="size-5" />
          </Button>
        </header>

        <div className="grid shrink-0 gap-3 border-b border-border px-5 py-4 sm:grid-cols-[minmax(0,1fr)_180px] sm:px-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索课件名称或内容"
              ref={searchInputRef}
              value={keyword}
            />
          </div>
          <Select
            aria-label="按课件类型筛选"
            onChange={(event) => setMaterialType(event.target.value as "" | CourseMaterialType)}
            value={materialType}
          >
            <option value="">全部类型</option>
            {materialGroups.map((group) => (
              <option key={group.type} value={group.type}>{group.label}</option>
            ))}
          </Select>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {filteredOptions.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {filteredOptions.map((option) => {
                const key = courseMaterialKey(option.materialType, option.materialId);
                const alreadyAdded = selectedMaterialKeys.has(key);
                const selected = selectedKeys.includes(key);
                const selectionFull = !selected && selectedKeys.length >= remainingSlots;

                return (
                  <label
                    className={cn(
                      "grid grid-cols-[minmax(0,1fr)_24px] gap-3 rounded-lg border bg-background p-4 transition-colors focus-within:ring-2 focus-within:ring-ring",
                      selected ? "border-primary bg-secondary" : "border-border",
                      alreadyAdded || selectionFull ? "cursor-not-allowed opacity-55" : "cursor-pointer hover:border-primary/35"
                    )}
                    key={key}
                  >
                    <span className="min-w-0">
                      <span className="line-clamp-1 block text-sm font-semibold">{option.title}</span>
                      <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">{option.subtitle}</span>
                      <span className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {courseMaterialDirectoryLabel(option.materialType, option.guidedStudyScene)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">更新于 {formatDate(option.updatedAt)}</span>
                        {alreadyAdded ? <Badge variant="muted">已添加</Badge> : null}
                      </span>
                    </span>
                    <span className={cn(
                      "mt-1 flex size-5 items-center justify-center rounded border",
                      selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card"
                    )}>
                      {selected ? <Check className="size-3.5" /> : null}
                    </span>
                    <input
                      checked={selected}
                      className="sr-only"
                      disabled={alreadyAdded || selectionFull}
                      onChange={() => setSelectedKeys((current) =>
                        toggleCourseMaterialSelection(current, key, selectedMaterialKeys, remainingSlots))}
                      type="checkbox"
                    />
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-56 items-center justify-center text-sm text-muted-foreground">
              {keyword || materialType ? "没有符合条件的课件" : "暂无可添加的课件"}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 sm:px-6">
          <p className="text-sm text-muted-foreground">已选择 {selectedKeys.length} 个课件</p>
          <div className="flex items-center gap-2">
            <Button onClick={onClose} type="button" variant="outline">取消</Button>
            <Button disabled={selectedKeys.length === 0} onClick={confirmSelection} type="button">
              <Plus />
              确认添加{selectedKeys.length > 0 ? `（${selectedKeys.length}）` : ""}
            </Button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
}
