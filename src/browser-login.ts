import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';

export function openBrowser(url: string): void {
  const program = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const child = spawn(program, args, { stdio: 'ignore', detached: true });
  child.on('error', () => {}); // 无桌面环境时仍可手动打开打印的网址。
  child.unref();
}

export async function browserLogin(api: string, options: {
  open?: (url: string) => void;
  announce?: (url: string) => void;
  timeoutMs?: number;
} = {}): Promise<{ token: string; expiresAt: number }> {
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const controller = new AbortController();
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: Error) => void;
  const codeReady = new Promise<string>((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
  // 启动失败和打开浏览器失败时，避免尚未 await 的 Promise 产生未处理拒绝。
  void codeReady.catch(() => {});
  let received = false;
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
    const callback = new URL(req.url || '/', 'http://127.0.0.1');
    if (req.method !== 'GET' || callback.pathname !== '/callback') { res.writeHead(404).end(); return; }
    if (received || callback.searchParams.get('state') !== state) {
      res.writeHead(400).end('Invalid authorization callback'); return;
    }
    if (callback.searchParams.get('error') === 'access_denied') {
      received = true;
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('已取消谷雨 CLI 授权，可以关闭此页面。');
      rejectCode(new Error('你已取消 CLI 授权')); return;
    }
    if (!/^[A-Za-z0-9_-]{43}$/.test(callback.searchParams.get('code') || '')) {
      res.writeHead(400).end('Invalid authorization callback'); return;
    }
    received = true;
    resolveCode(callback.searchParams.get('code')!);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<!doctype html><meta name="viewport" content="width=device-width"><title>谷雨 CLI</title><body style="font:16px/1.8 system-ui;padding:48px"><h1>授权已接收</h1><p>请回到 Agent 或终端查看登录结果。可以关闭此页面。</p>');
  });
  const interrupted = () => { controller.abort(); rejectCode(new Error('登录已取消')); };
  const timer = setTimeout(() => { controller.abort(); rejectCode(new Error('登录等待超时，请重新运行 guyu login')); }, options.timeoutMs ?? 300000);
  process.once('SIGINT', interrupted);
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`;
    const url = new URL('/cli', api);
    url.search = new URLSearchParams({ authorize: '1', redirectUri, challenge, state }).toString();
    options.announce?.(url.href);
    (options.open ?? openBrowser)(url.href);
    const code = await codeReady;
    const response = await fetch(`${api}/auth/cli/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Guyu-Client': 'cli' },
      body: JSON.stringify({ code, verifier, redirectUri }), signal: controller.signal,
    });
    const result = await response.json() as { token?: string; expiresAt?: number; message?: string };
    if (!response.ok || !result.token || !result.expiresAt) throw new Error(result.message || '授权失败，请重新登录');
    return { token: result.token, expiresAt: result.expiresAt };
  } finally {
    clearTimeout(timer);
    process.removeListener('SIGINT', interrupted);
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
