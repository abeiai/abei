import type { ReactNode } from "react";

import { PublicShell } from "@/components/shell/public-shell";

export default function ExperienceLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <PublicShell showFooter={false}>{children}</PublicShell>;
}
