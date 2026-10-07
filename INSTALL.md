# 给安装 Agent 的指引

用户授权安装谷雨 CLI 后，按下面步骤安装和验证。这里只安装客户端，不部署服务端。

## 安装前

1. 检查 node --version 和 npm --version，需要 Node.js 22.16 或更新版本。
2. Node.js 不符合要求时，优先使用机器现有的用户级版本管理器，或让用户安装官方版本。不要擅自覆盖系统 Node.js，不要使用未经检查的远程安装脚本。
3. 确认仓库来自用户提供的 GitHub 链接，阅读 package.json，检查 dist/guyu.mjs 存在。

## 安装

```sh
npm install -g --install-links <用户提供的GitHub仓库URL>
guyu --help
```

`--install-links` 确保安装实际文件，避免部分 npm 配置生成指向临时克隆目录的失效链接。

也可以下载或克隆到新目录，在仓库根目录运行 npm install -g --install-links .。仓库带预构建程序，没有 prepare、preinstall、postinstall 脚本，不需要安装开发依赖或构建整个网站。GitHub 安装通常需要 Git；没有 Git 时可以下载仓库 ZIP，解压后本地安装。

遇到安装权限错误，不要直接使用 sudo 或管理员权限。优先使用用户级 Node.js，或设置专用用户目录作为 npm 安装前缀，再将命令入口加入 PATH。macOS 和 Linux 的入口在前缀下的 bin，Windows 的入口在前缀根目录。

## 验证与登录

必须运行 guyu --help 确认安装成功。不需要调用生产提问接口验证安装，不要自动发送短信。

需要知识库权限时，让用户自己运行 guyu login 并输入手机号和验证码。不要让用户在对话中提供验证码或凭据，不要读取或输出已有登录配置。

登录后可运行 guyu --json 问题 获得结构化回答，或 guyu search 关键词 查找视频。CLI 不需要后台服务和定时任务。

## 更新

重新安装相同 GitHub URL 即可更新。需要可复现版本时用 #提交号或 #标签固定版本，不要改写用户的登录配置或服务地址。
