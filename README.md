# 谷雨 CLI

让 Agent 查询大会演讲和已收录的 YouTube 内容，回答附带来源与视频时间戳。

## 安装

需要 Node.js 22.16 或更新版本。可以把 https://github.com/aimakersummit/guyu_cli 交给 Agent 安装，或使用预构建安装包：

```sh
npm install -g https://ask.aimakersummit.com/downloads/guyu-cli-0.3.0.tgz
```

## Agent 登录流程

用户不需要打开终端。Agent 执行 `guyu login --json`，命令立即返回 authorizationUrl 并退出。Agent 必须在对话里把它呈现为可点击的授权链接，不要求用户运行命令或打开 CLI。

用户点击链接，在网页登录并确认授权。已有网站登录状态时只需确认。随后回到 Agent 告知已完成授权，由 Agent 执行 `guyu login finish --json` 一次。结果为 authorized 时即可查询；pending 时等待用户确认，不要循环轮询；denied 时停止。用户取消可由 Agent 执行 `guyu login cancel`。

链接 10 分钟有效，校验信息只保存在本机私有文件中，不随链接输出。领取成功后删除待授权文件，登录凭据存于 `~/.config/guyu/config.json`，仅当前用户可读写，有效期 7 天。退出登录执行 `guyu logout`。

默认流程不自动打开浏览器、不监听本机端口、不启动常驻服务，也不定时查询数据库。Agent 和浏览器可以在不同设备，授权结果只有发起请求的客户端才能领取。不要授权他人发来的链接。

## 使用

```sh
guyu Agent 开发有哪些值得借鉴的实践
guyu search 智能体
guyu
```

无参数运行进入连续对话，`/new` 开始新会话，`/quit` 退出。`--json` 输出结构化结果，`--scope 3` 限定最近 3 个月，`--talk ID` 限定视频。

旧版同机浏览器回调方式仍可显式通过 `guyu login browser` 使用，不是默认安装或登录流程。
