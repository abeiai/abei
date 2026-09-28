CREATE TYPE "PaymentScene" AS ENUM ('DESKTOP_WEB', 'MOBILE_WEB', 'WECHAT_BROWSER');

CREATE TYPE "PaymentProduct" AS ENUM ('ALIPAY_PAGE', 'ALIPAY_WAP', 'WECHAT_NATIVE', 'WECHAT_H5', 'WECHAT_JSAPI');

CREATE TYPE "PaymentAction" AS ENUM ('REDIRECT', 'QR_CODE', 'WECHAT_JSAPI');

ALTER TABLE "users"
ADD COLUMN "wechatOpenId" TEXT;

ALTER TABLE "payment_orders"
ADD COLUMN "scene" "PaymentScene" NOT NULL DEFAULT 'DESKTOP_WEB',
ADD COLUMN "product" "PaymentProduct" NOT NULL DEFAULT 'ALIPAY_PAGE',
ADD COLUMN "action" "PaymentAction" NOT NULL DEFAULT 'REDIRECT',
ADD COLUMN "launchParams" JSONB,
ADD COLUMN "clientIp" TEXT,
ADD COLUMN "userAgent" TEXT;

CREATE UNIQUE INDEX "users_wechatOpenId_key" ON "users"("wechatOpenId");

CREATE INDEX "payment_orders_scene_product_idx" ON "payment_orders"("scene", "product");
