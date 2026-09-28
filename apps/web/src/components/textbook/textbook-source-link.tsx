import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSmartEduTextbookSourceUrl } from "@/lib/textbook-source";

export function TextbookSourceLink({ sourceUrl }: { sourceUrl: string | null }) {
  const safeSourceUrl = getSmartEduTextbookSourceUrl(sourceUrl);

  if (!safeSourceUrl) {
    return null;
  }

  return (
    <Button asChild className="self-start">
      <a href={safeSourceUrl} rel="noreferrer" target="_blank">
        <ExternalLink data-icon="inline-start" />
        获取电子教材
      </a>
    </Button>
  );
}
