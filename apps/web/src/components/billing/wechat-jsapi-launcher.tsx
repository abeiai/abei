"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export interface JsapiParams {
  appId: string;
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: string;
  paySign: string;
}

declare global {
  interface Window {
    WeixinJSBridge?: {
      invoke(
        method: "getBrandWCPayRequest",
        params: JsapiParams,
        callback: (result: { err_msg?: string }) => void
      ): void;
    };
  }
}

export function WechatJsapiLauncher({ params }: { params: JsapiParams }) {
  const router = useRouter();
  const [message, setMessage] = useState("正在准备拉起微信支付...");

  const launch = useCallback(() => {
    if (!window.WeixinJSBridge) {
      setMessage("未检测到微信支付桥接能力，请确认当前页面位于微信内浏览器。");
      return;
    }

    window.WeixinJSBridge.invoke("getBrandWCPayRequest", params, (result) => {
      if (result.err_msg === "get_brand_wcpay_request:ok") {
        setMessage("支付已提交，正在刷新订单状态。");
        router.refresh();
        return;
      }

      setMessage("支付未完成，可重新发起。");
    });
  }, [params, router]);

  useEffect(() => {
    launch();
  }, [launch]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4 text-sm">
      <p className="text-muted-foreground">{message}</p>
      <Button className="w-fit" onClick={launch} type="button">
        重新拉起微信支付
      </Button>
    </div>
  );
}
