"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isPaidPaymentSyncPayload, paymentSyncPath } from "@/lib/payment-polling";

export function PaymentPoller({
  enabled,
  orderId,
  successHref
}: {
  enabled: boolean;
  orderId: string | null;
  successHref: string;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled || !orderId) {
      return;
    }

    let stopped = false;
    let syncing = false;
    let timer: number | null = null;

    async function syncOrder() {
      if (syncing || stopped || !orderId) {
        return;
      }

      syncing = true;

      try {
        const response = await fetch(paymentSyncPath(orderId), {
          credentials: "same-origin",
          method: "POST"
        });
        const payload = await response.json().catch(() => null);

        if (stopped) {
          return;
        }

        if (response.ok && isPaidPaymentSyncPayload(payload)) {
          stopped = true;

          if (timer !== null) {
            window.clearInterval(timer);
          }

          router.replace(successHref);
          router.refresh();
          return;
        }

        router.refresh();
      } catch {
        if (!stopped) {
          router.refresh();
        }
      } finally {
        syncing = false;
      }
    }

    timer = window.setInterval(syncOrder, 5000);
    void syncOrder();

    return () => {
      stopped = true;

      if (timer !== null) {
        window.clearInterval(timer);
      }
    };
  }, [enabled, orderId, router, successHref]);

  return null;
}
