import React from 'react';
import Link from 'next/link';

const release = 'https://github.com/abeiai/abei-creator/releases/download/v0.1.1/';
const clients = [
  { name: 'Codex', file: 'abei-creator-codex-0.1.1.zip', status: '已检查命令行安装；账号连接与完整创作流程待验证。', steps: ['下载并解压安装包，在终端添加本地插件市场，再安装插件。', '在 Codex 中启用阿贝绘本创作助手，按提示登录阿贝主账号。'], command: 'codex plugin marketplace add <解压目录>\ncodex plugin add abei-creator@abei-local' },
  { name: 'Claude Code', file: 'abei-creator-claude-code-0.1.1.zip', status: '安装包已生成；真实客户端安装与账号连接待验证。', steps: ['解压安装包，以插件目录启动 Claude Code。', '启用连接后，按浏览器提示授权阿贝主账号。'], command: 'claude --plugin-dir <解压目录>' },
  { name: 'Claude Desktop', file: 'abei-creator-desktop-0.1.1.mcpb', status: '格式校验通过，客户端可识别包信息；本次设备策略禁止安装扩展，实际安装未完成。', steps: ['下载扩展包，在 Claude Desktop 的扩展设置中选择安装。', '本地助手显示设备码后，在阿贝确认账号与权限，再返回客户端继续。'] },
  { name: 'Claude Cowork', file: 'abei-creator-claude-cowork-0.1.1.zip', status: '云端插件包已生成；实际导入、授权和私有文件传输待验证。', steps: ['解压并按客户端提供的插件导入入口添加。', '连接地址为下方远程服务地址；只有客户端能安全读取和传输文件时才能同步素材。'] },
  { name: '豆包工作电脑版', file: 'abei-creator-doubao-work-0.1.1.zip', status: '当前仅提供创作技能和指南；未获得工作电脑版入口，安装方式与连接能力待验证。', steps: ['此包不包含已验证的原生连接器。', '普通豆包客户端不作为工作电脑版的兼容性证明；暂不承诺自动同步。'] },
  { name: 'WorkBuddy', file: 'abei-creator-workbuddy-0.1.1.zip', status: '远程配置与可选本地配置生成已检查；客户端导入、授权及创作待验证。', steps: ['解压后按指南添加远程连接配置与创作技能。', '需要本地文件能力时，使用指南中的本地配置生成命令及实际下载的命令行包。'] },
  { name: 'DeepSeek Harness', file: 'abei-creator-deepseek-0.1.1.zip', status: '已在 dsh 0.2.0-rc.2 检查安装与启用；账号连接和完整创作流程待验证。', steps: ['解压后按包内指南安装并启用扩展。', '首次连接显示设备码，在阿贝授权主账号后返回客户端继续。'] }
];
const extras = ['abeiai-creator-0.1.1.tgz', 'abei-creator-source-0.1.1.zip', 'abei-creator-darwin-arm64', 'abei-creator-darwin-x64', 'abei-creator-linux-arm64', 'abei-creator-linux-x64', 'abei-creator-windows-x64.exe'];
export function CreatorInstallation() {
  return <main className="mx-auto max-w-5xl space-y-8 px-5 py-8">
    <header className="space-y-4"><h1 className="text-2xl font-semibold tracking-normal">阿贝绘本创作助手</h1><p className="text-sm leading-6 text-muted-foreground">在你的 AI 客户端中创作绘本，同步到阿贝，预览后提交审核。</p><nav aria-label="创作导航" className="flex flex-wrap gap-4 text-sm underline"><Link href="/account/connections">管理已连接客户端</Link><Link href="/storybook">我的绘本</Link><Link href="/dashboard/courses">我的专辑</Link><Link href="/creator/device">输入设备码</Link></nav></header>
    <div role="status" className="rounded-xl border border-border bg-secondary p-4 text-sm leading-6">0.1.1 预览版已开放下载。请按各客户端下方的验证状态选择安装方式。</div>
    <section aria-labelledby="install-clients" className="space-y-4"><h2 id="install-clients" className="text-base font-semibold">选择客户端</h2>{clients.map(client => <details key={client.name} className="rounded-2xl border border-border bg-background p-5 shadow-sm"><summary className="cursor-pointer font-semibold">{client.name}</summary><div className="mt-4 space-y-3 text-sm leading-6"><p className="text-muted-foreground">{client.status}</p><a className="underline" href={`${release}${client.file}`}>0.1.1 安装包</a><ol className="list-decimal space-y-2 pl-5">{client.steps.map(step => <li key={step}>{step}</li>)}</ol>{client.command && <pre className="overflow-x-auto rounded-lg bg-secondary p-3 text-xs"><code>{client.command}</code></pre>}</div></details>)}</section>
    <section aria-labelledby="use-creator" className="space-y-3"><h2 id="use-creator" className="text-base font-semibold">开始创作</h2><ol className="list-decimal space-y-2 pl-5 text-sm leading-6"><li>打开创作助手，确认阿贝主账号与请求权限，完成连接。</li><li>告诉助手绘本主题、读者年龄、画风和页数，确认分镜后生成或提供图片、配音。</li><li>让助手同步草稿，到“我的绘本”或“我的专辑”预览。</li><li>确认内容后明确要求“提交审核”。同步草稿不会自动公开；审核反馈可在作品页查看。</li></ol><p className="text-sm text-muted-foreground">图片、配音能力取决于你使用的客户端。缺少素材时先保留草稿。</p></section>
    <details className="rounded-xl border border-border p-5"><summary className="cursor-pointer text-sm font-semibold">手动连接、命令行与更新</summary><div className="mt-4 space-y-3 text-sm leading-6"><p>远程服务地址：<code className="break-all">https://mcp.abeiai.com/mcp</code></p><p>更新前停止同一账号配置下运行的旧助手，再替换安装包。保留原创作项目和本地助手账号目录；按包内指南升级。重新授权或停止使用可前往“已连接客户端”。</p><p>独立命令行包含 macOS、Linux 与 Windows 版本。macOS ARM64 和容器中的 Linux ARM64 已检查基础执行，其余系统与 Windows 权限仍待实机验证；程序尚未签名。</p><ul className="space-y-1">{extras.map(file => <li key={file}><a className="break-all underline" href={`${release}${file}`}>{file}</a></li>)}<li><a className="underline" href={`${release}SHA256SUMS`}>校验文件</a></li></ul><a className="underline" href="https://github.com/abeiai/abei-creator">完整安装与更新指南</a></div></details>
  </main>;
}
