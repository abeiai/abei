"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface StreamToolFormProps {
  scenarioId: string | null;
  placeholder: string;
  promptVariables: Array<{
    name: string;
    label: string;
    required: boolean;
    placeholder: string;
  }>;
}

export function StreamToolForm({ scenarioId, placeholder, promptVariables }: StreamToolFormProps) {
  const [input, setInput] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [output, setOutput] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!scenarioId) {
      setMessage("当前 AI 场景不可用");
      return;
    }

    setOutput("");
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/ai/tasks/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          scenarioId,
          input,
          variables
        })
      });

      if (!response.ok || !response.body) {
        setMessage("请先登录，或稍后重试流式生成");
        return;
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

          const event = JSON.parse(line) as {
            type?: string;
            text?: string;
            message?: string;
            task?: {
              statusName?: string;
            };
          };

          if (event.type === "delta" && event.text) {
            setOutput((current) => `${current}${event.text}`);
          }

          if (event.type === "done") {
            setMessage(event.task?.statusName ?? "生成完成");
          }

          if (event.type === "error" || event.type === "cancelled") {
            setMessage(event.message ?? "流式生成失败");
          }
        }
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="stream-input">流式输入</FieldLabel>
          <Textarea
            id="stream-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            minLength={2}
            maxLength={2000}
            placeholder={placeholder}
            rows={5}
          />
          <FieldDescription>流式模式会逐字展示结果，中断时后端会释放冻结点数。</FieldDescription>
        </Field>
        {promptVariables.map((variable) => (
          <Field key={variable.name}>
            <FieldLabel htmlFor={`stream-var-${variable.name}`}>{variable.label}</FieldLabel>
            <Input
              id={`stream-var-${variable.name}`}
              value={variables[variable.name] ?? ""}
              onChange={(event) =>
                setVariables((current) => ({
                  ...current,
                  [variable.name]: event.target.value
                }))
              }
              placeholder={variable.placeholder}
              required={variable.required}
            />
          </Field>
        ))}
      </FieldGroup>
      <Button className="w-fit" disabled={isPending || input.trim().length < 2} onClick={submit} type="button">
        {isPending ? <LoaderCircle data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
        {isPending ? "流式生成中..." : "流式生成"}
      </Button>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      <div className="min-h-32 whitespace-pre-wrap rounded-md border border-border bg-background p-4 text-sm leading-7">
        {output || "流式输出会显示在这里。"}
      </div>
    </div>
  );
}
