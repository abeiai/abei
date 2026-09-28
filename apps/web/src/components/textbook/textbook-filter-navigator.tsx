"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import type { PublicTextbookListResult } from "@/lib/textbook-public-api";
import { textbookPath, type TextbookRouteFilters } from "@/lib/textbook-seo";

interface TextbookFilterNavigatorProps {
  current: TextbookRouteFilters;
  filters: PublicTextbookListResult["filters"];
}

export function TextbookFilterNavigator({ current, filters }: TextbookFilterNavigatorProps) {
  const router = useRouter();
  const [educationType, setEducationType] = useState(current.educationType ?? "");
  const [grade, setGrade] = useState(current.grade ?? "");
  const [subject, setSubject] = useState(current.subject ?? "");
  const [version, setVersion] = useState(current.version ?? "");
  const nextHref = useMemo(
    () =>
      textbookPath({
        educationType: educationType || undefined,
        grade: grade || undefined,
        subject: subject || undefined,
        version: version || undefined
      }),
    [educationType, grade, subject, version]
  );

  return (
    <form
      className="textbook-filter-form"
      onSubmit={(event) => {
        event.preventDefault();
        router.push(nextHref);
      }}
    >
      <FilterSelect
        label="类型"
        onChange={setEducationType}
        options={filters.educationTypes}
        placeholder="全部类型"
        value={educationType}
      />
      <FilterSelect
        label="年级"
        onChange={setGrade}
        options={filters.grades}
        placeholder="全部年级"
        value={grade}
      />
      <FilterSelect
        label="学科"
        onChange={setSubject}
        options={filters.subjects}
        placeholder="全部学科"
        value={subject}
      />
      <FilterSelect
        label="版本"
        onChange={setVersion}
        options={filters.versions}
        placeholder="全部版本"
        value={version}
      />
      <div className="flex items-end">
        <Button className="w-full" type="submit">
          <Search data-icon="inline-start" />
          查询教材
        </Button>
      </div>
      <div className="flex items-end">
        <Button className="w-full" onClick={() => router.push("/textbook")} type="button" variant="outline">
          重置
        </Button>
      </div>
    </form>
  );
}

function FilterSelect({
  label,
  onChange,
  options,
  placeholder,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  value: string;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select onChange={(event) => onChange(event.target.value)} value={value}>
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}
