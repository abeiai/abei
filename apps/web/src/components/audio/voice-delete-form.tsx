"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type VoiceDeleteFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  id: string;
};

export function VoiceDeleteForm({ action, id }: VoiceDeleteFormProps) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm("确认删除这个音色？历史任务和已生成音频不会被删除。")) {
          event.preventDefault();
        }
      }}
    >
      <input name="id" type="hidden" value={id} />
      <Button size="sm" type="submit" variant="outline">
        <Trash2 data-icon="inline-start" />
        删除
      </Button>
    </form>
  );
}
