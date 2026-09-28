type PaymentSyncPayload = {
  code?: number;
  data?: {
    channelStatus?: string;
    order?: {
      status?: string;
    };
  };
};

export function paymentSyncPath(orderId: string) {
  return `/api/payment/orders/${encodeURIComponent(orderId)}/sync`;
}

export function isPendingPaymentStatus(status: string | null | undefined) {
  return status === "CREATED" || status === "PAYING";
}

export function isPaidPaymentSyncPayload(payload: unknown) {
  const value = payload as PaymentSyncPayload;

  return value?.code === 0 && (value.data?.channelStatus === "PAID" || value.data?.order?.status === "PAID");
}
