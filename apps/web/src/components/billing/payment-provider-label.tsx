import { faAlipay, faWeixin } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { PaymentProvider } from "@/lib/billing-api";

export function PaymentProviderLabel({
  provider,
  providerName,
  iconOnly = false
}: {
  provider: PaymentProvider;
  providerName: string;
  iconOnly?: boolean;
}) {
  const icon = (
    <FontAwesomeIcon aria-hidden="true" className="size-5 shrink-0" icon={provider === "WECHAT_PAY" ? faWeixin : faAlipay} />
  );

  if (iconOnly) {
    return (
      <span aria-label={providerName} className="inline-flex items-center text-muted-foreground" title={providerName}>
        {icon}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 text-foreground">
      <span className="text-muted-foreground">{icon}</span>
      <span>{providerName}</span>
    </span>
  );
}
