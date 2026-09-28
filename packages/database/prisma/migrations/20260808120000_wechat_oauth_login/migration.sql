ALTER TABLE "users"
ADD COLUMN "wechatWebOpenId" TEXT,
ADD COLUMN "wechatUnionId" TEXT;

CREATE UNIQUE INDEX "users_wechatWebOpenId_key" ON "users"("wechatWebOpenId");
CREATE UNIQUE INDEX "users_wechatUnionId_key" ON "users"("wechatUnionId");
