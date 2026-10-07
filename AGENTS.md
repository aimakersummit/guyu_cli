# 谷雨 CLI 仓库说明

用户要求安装时，先阅读 README.md 和 INSTALL.md，按其中步骤安装并运行 guyu --help 验证。

这是独立客户端，不需要网站后端、模型 API Key、云服务密钥、后台进程或定时任务。安装验证不要发送短信，不要调用生产模型，不要读取或输出登录凭据。

用户要求修改代码时，改 src，运行 npm run typecheck、npm run build 和 npm test，并同步更新 dist，保持 GitHub 仓库可以直接安装。
