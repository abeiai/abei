"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export interface ActionToastState {
  error?: string;
  message?: string;
  status?: "success" | "error";
  submittedAt?: number;
  success?: string;
}

interface ActionToastProps {
  className?: string;
  duration?: number;
  state: ActionToastState;
}

export function ActionToast({ className, duration = 3000, state }: ActionToastProps) {
  const [visible, setVisible] = useState(false);
  const message = state.message ?? state.success ?? state.error ?? "";
  const status = state.status ?? (state.error ? "error" : message ? "success" : undefined);

  useEffect(() => {
    if (!message) {
      return;
    }

    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), duration);

    return () => window.clearTimeout(timer);
  }, [duration, message, state]);

  if (!visible || !message || !status) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className={cn(
        "fixed right-6 top-6 z-50 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg",
        status === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-red-200 bg-red-50 text-red-700",
        className
      )}
    >
      {message}
    </div>
  );
}
