ALTER TABLE "users"
ADD COLUMN "wechatMpOpenId" TEXT;

CREATE UNIQUE INDEX "users_wechatMpOpenId_key" ON "users"("wechatMpOpenId");
