# 旧版 common 接口转发

`https://abeiai.com/open/v5/common/` 及其子路径由入口 Nginx 直接代理到 `https://long-api.abeiai.com` 的相同路径；无尾斜杠的 `/open/v5/common` 也直接代理。请求方法、原始 URI（含查询参数编码及重复参数）和 body 字节保持不变，不经过 Next.js 或跳转。JSON、表单、multipart 和二进制内容均不解析、不重新序列化。

上游 Host 和 TLS SNI 使用 `long-api.abeiai.com`，验证上游证书，允许证书链深度 3 以兼容当前上游的交叉签名链；HTTP 连接头由代理管理。关闭请求和响应缓冲、缓存、代理重试、响应跳转改写和错误拦截。Docker DNS 每 60 秒更新解析；此路径不限制 body 大小，读写超时为 720 秒。现有 HTTP 入口仍跳转 HTTPS。

验证：`node --test scripts/release/common-proxy.integration.test.mjs` 使用隔离 Nginx 和 HTTPS 回显服务，占用本地测试端口 3606/3607；`node --test scripts/release/abei-production.test.mjs` 验证生产部署约束。线上只更新 `/opt/abei/deploy/abei/production.conf`，备份原配置，经 `docker exec abei-prod nginx -t` 后 reload，保留其余服务和数据。
