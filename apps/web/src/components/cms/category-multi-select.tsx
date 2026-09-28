"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CmsCategory } from "@/lib/cms-api";

export function CategoryMultiSelect({
  categories,
  defaultSelectedIds
}: {
  categories: CmsCategory[];
  defaultSelectedIds: string[];
}) {
  const initialSelectedIds = defaultSelectedIds.length > 0 ? defaultSelectedIds : categories[0] ? [categories[0].id] : [];
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState(initialSelectedIds);
  const selectedCategories = useMemo(
    () => categories.filter((category) => selectedIds.includes(category.id)),
    [categories, selectedIds]
  );
  const label =
    selectedCategories.length === 0
      ? "请选择分类目录"
      : selectedCategories.length <= 2
        ? selectedCategories.map((category) => category.name).join("、")
        : `已选择 ${selectedCategories.length} 个分类`;

  function toggleCategory(categoryId: string) {
    setSelectedIds((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId]
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        aria-expanded={isOpen}
        className="min-h-11 w-full justify-between rounded-lg px-4"
        onClick={() => setIsOpen((value) => !value)}
        type="button"
        variant="outline"
      >
        <span className={cn("truncate", selectedCategories.length === 0 && "text-muted-foreground")}>{label}</span>
        <ChevronDown className={cn("transition-transform", isOpen && "rotate-180")} data-icon="inline-end" />
      </Button>

      {isOpen ? (
        <div className="flex max-h-64 flex-col gap-1 overflow-auto rounded-lg border border-border bg-background p-2">
          {categories.map((category) => {
            const checked = selectedIds.includes(category.id);

            return (
              <label
                className={cn(
                  "flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-3 text-sm hover:bg-secondary",
                  checked && "bg-secondary text-foreground"
                )}
                key={category.id}
              >
                <input
                  checked={checked}
                  className="size-4 accent-foreground"
                  name="categoryIds"
                  onChange={() => toggleCategory(category.id)}
                  type="checkbox"
                  value={category.id}
                />
                <span className="truncate">{category.name}</span>
              </label>
            );
          })}
        </div>
      ) : (
        selectedIds.map((categoryId) => (
          <input key={categoryId} name="categoryIds" type="hidden" value={categoryId} />
        ))
      )}
    </div>
  );
}
