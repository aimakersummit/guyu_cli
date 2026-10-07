# Agent 安装与授权指引

以下命令全部由 Agent 执行，不要要求用户打开终端、输入命令或启动 CLI。用户只需点击授权链接。

## 安装

需要 Node.js 22.16 或更新版本。先检查 Node.js 与 npm；缺少运行环境时说明情况并征求用户同意。克隆仓库，或更新已有 checkout，然后在仓库目录执行：

```sh
npm install -g --install-links .
guyu --help
```

dist/guyu.mjs 已预构建，无需部署服务器、模型 API Key 或后台常驻服务。全局目录无权限时使用用户可写的 npm 前缀，不擅自使用 sudo。

## 生成链接

```sh
guyu login --json
```

命令生成授权链接后立即退出，不需要保持进程运行。读取返回 JSON 的 authorizationUrl，将完整网址作为可点击的 Markdown 链接发在对话里，例如标签为点击授权谷雨。不要只展示原始 JSON，不要要求用户自己执行登录命令，不要打开终端窗口。

让用户在网页完成登录并点击确认授权，然后回到对话告知已完成。不要读取或代填手机号、验证码、浏览器 Cookie，不要读取和输出本机凭据文件。不要替用户点击确认授权。

## 完成授权

用户回复完成授权后，执行一次：

```sh
guyu login finish --json
```

status 为 authorized 表示完成，可以查询。pending 表示用户尚未授权，告诉用户先完成网页授权后再继续，禁止用循环、定时器或后台任务反复领取。denied 表示用户拒绝授权，应停止。

链接 10 分钟有效。过期时按用户请求重新执行 guyu login。用户取消时执行 guyu login cancel。不要自动反复创建新链接，不要把授权链接发给其他人，不要修改其域名或参数。

默认流程不启动本机回调监听，浏览器和 Agent 可以不在同一台设备。不要使用旧版 guyu login browser 流程。

## 查询

完成后直接用 guyu 查询用户的问题，需要引用时保留来源与视频时间戳。退出登录由 Agent 执行 guyu logout。
