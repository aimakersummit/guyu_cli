# 谷雨 CLI

在终端或 AI Agent 中检索谷雨视频知识库，获得带来源和视频时间戳的回答。

## 把仓库链接交给 Agent

把这个 GitHub 仓库链接发给 Agent，再告诉它：

请帮我安装这个仓库里的谷雨 CLI，先阅读 README.md 和 INSTALL.md，安装后运行 guyu --help 验证。不要启动后台服务。需要登录时让我自己输入手机号和验证码。

仓库已经包含构建好的程序，不需要部署网站、配置数据库或填写模型 API Key。

## 直接安装

需要 Node.js 22.16 或更新版本。

```sh
npm install -g https://github.com/aimakersummit/guyu_cli
guyu --help
```

也可以下载或克隆仓库，在仓库根目录执行：

```sh
npm install -g .
guyu --help
```

安装不需要运行构建脚本。权限和跨平台处理见 [INSTALL.md](INSTALL.md)。

## 登录与使用

```sh
guyu login
guyu Agent 开发有哪些值得借鉴的实践
guyu --scope 3 最近三个月 Agent 有哪些新做法
guyu search 智能体
guyu
```

登录时使用网站的手机号和短信验证码，会员权益与网站一致。

无参数运行进入连续对话，/new 开启新会话，/quit 退出。--scope all、1、3、6、12 选择全部或最近相应月数的内容；--talk talkId 限定视频；--json 输出结构化 JSON，适合 Agent 和脚本处理。

默认连接 https://ask.aimakersummit.com/api。凭据保存在 ~/.config/guyu/config.json，权限为仅当前用户可读写，七天后重新登录。guyu logout 退出并删除本机凭据。

CLI 只在执行命令时请求服务，没有后台轮询。安装、查看帮助和本地测试不调用生产模型，不发送短信。执行 guyu login 才发送短信，搜索和提问会访问服务。

## 更新与卸载

更新时重新运行 GitHub 安装命令。需要固定版本时，在仓库 URL 后加 #标签或提交号。

```sh
guyu logout
npm uninstall -g @guyu/cli
```

## 修改源码

```sh
npm ci
npm run typecheck
npm run build
npm test
```

源码在 src。修改后重新构建，并将 dist/guyu.mjs 和 dist/guyu.mjs.map 一起提交，否则用户安装得到的仍是旧程序。

## 上传到 GitHub

创建一个公开仓库，将本文件所在目录的内容放到仓库根目录，而不是再套一层目录。包括 dist、src、scripts、tests、package.json、package-lock.json 和说明文件。

不要上传 node_modules、个人配置、.env 或登录凭据。本代码包没有网站后端或云服务密钥。GitHub 仓库发布后，把仓库链接交给用户或 Agent 即可，不需要发布到 npm 注册表。
