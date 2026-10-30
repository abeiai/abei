# cc.abeiai.com 证书自动续期

`cc.abeiai.com` 使用腾讯 CDN，公开素材仍从 `r.abeiai.com` 回源。腾讯 CDN 将 `/.well-known/acme-challenge/*` 重定向至 `http://abeiai.com/.well-known/acme-challenge/$1`，由现有 Nginx webroot 提供 HTTP-01 验证。不要删除此规则或为验证目录配置缓存。

服务器 `certbot.timer` 负责证书续签。续签成功后，`deploy-hook.sh` 启动 `abei-cdn-cert-sync.service`，校验证书域名、密钥、有效期及可信证书链，并仅更新腾讯 CDN 的证书配置。`abei-cdn-cert-sync.timer` 每四小时检查并重试；日志在 systemd journal 中。节点传播期间，已提交的新证书在 12 小时内不会反复提交。单次边缘节点验证不能证明全球所有节点均已更新。

腾讯 API 凭据通过 `install-credentials.py` 的标准输入提供，仅以 AES-GCM 密文保存在服务器 `/etc/abei-cdn-cert/`；目录权限 0700，密文和本机密钥权限 0600，所有者为 root。加密密钥位于同一服务器，无法防止服务器 root 读取凭据。更换或撤销腾讯云密钥时必须重新安装可用凭据；建议使用仅允许查询和修改此 CDN 域名证书的专用 CAM 凭据。仓库不得保存凭据、证书私钥或真实环境文件。

检查命令：

```sh
systemctl list-timers certbot.timer abei-cdn-cert-sync.timer
journalctl -u abei-cdn-cert-sync.service -n 30 --no-pager
certbot renew --cert-name cc.abeiai.com --dry-run
systemctl start abei-cdn-cert-sync.service
```

当前未配置主动失败通知，应将证书到期时间、Certbot 和同步服务失败接入现有监控。其他域名的证书不由本同步服务管理。
