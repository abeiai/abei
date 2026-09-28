import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-lg border border-input bg-card px-4 py-2 text-base text-foreground outline-none transition-all placeholder:text-muted-foreground hover:border-primary/35 focus:border-primary focus:ring-[3px] focus:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      type={type}
      {...props}
    />
  );
}

export { Input };
