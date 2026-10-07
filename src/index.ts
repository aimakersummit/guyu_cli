import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import type { ChatEvent, Citation, PublicTalk, Scope } from './contracts.js';

type Config = { api: string; token?: string; expiresAt?: number };
type CliOptions = { api: string; scope: Scope; json: boolean; args: string[] };

const DEFAULT_API = 'https://ask.aimakersummit.com/api';
const CONFIG_PATH =
  process.env.GUYU_CONFIG?.trim() || join(homedir(), '.config', 'guyu', 'config.json');

class CliError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function loadConfig(): Promise<Config> {
  try {
    const parsed = JSON.parse(await readFile(CONFIG_PATH, 'utf8')) as Partial<Config>;
    return {
      api: cleanApi(parsed.api || DEFAULT_API),
      token: parsed.token,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return { api: DEFAULT_API };
  }
}

async function saveConfig(config: Config): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 });
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(CONFIG_PATH, 0o600);
}

function cleanApi(value: string): string {
  const parsed = new URL(value);
  if (
    parsed.protocol !== 'https:' &&
    !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))
  )
    throw new CliError('服务地址需要使用 HTTPS，本地调试可以使用 HTTP');
  const url = value.replace(/\/+$/, '');
  return url.endsWith('/api') ? url : `${url}/api`;
}

function parseArgs(argv: string[], config: Config): CliOptions {
  let api = config.api;
  let scope: Scope = { type: 'all' };
  let json = false;
  const args: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--api') api = cleanApi(argv[++i] || '');
    else if (arg === '--scope') {
      const value = argv[++i];
      if (value === 'all') scope = { type: 'all' };
      else if (['1', '3', '6', '12'].includes(value || ''))
        scope = { type: 'recent', months: Number(value) as 1 | 3 | 6 | 12 };
      else throw new CliError('--scope 只支持 all、1、3、6、12');
    } else if (arg === '--talk') {
      const talkId = argv[++i];
      if (!talkId) throw new CliError('--talk 后需要 talkId');
      scope = { type: 'talk', talkId };
    } else if (arg === '--json') json = true;
    else args.push(arg);
  }
  return { api, scope, json, args };
}

async function request<T>(
  api: string,
  path: string,
  config: Config,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Guyu-Client': 'cli',
      ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
      ...init.headers,
    },
  });
  const data = (await response.json().catch(() => ({}))) as {
    message?: string;
    code?: string;
  };
  if (!response.ok)
    throw new CliError(
      data.message || `请求失败，HTTP ${response.status}`,
      response.status,
      data.code,
    );
  return data as T;
}

async function login(api: string, config: Config): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const phone = (await rl.question('手机号：')).trim();
    await request(
      api,
      '/auth/sms/send',
      { api },
      {
        method: 'POST',
        body: JSON.stringify({ phone }),
      },
    );
    const code = (await rl.question('短信验证码：')).trim();
    const result = await request<{ token: string; expiresAt: number }>(
      api,
      '/auth/sms/verify',
      { api },
      {
        method: 'POST',
        body: JSON.stringify({ phone, code }),
      },
    );
    if (!result.token) throw new CliError('登录成功，但服务端没有返回 CLI 凭据，请更新服务端');
    await saveConfig({ api, token: result.token, expiresAt: result.expiresAt });
    stdout.write('登录成功，凭据已安全保存在本机。\n');
  } finally {
    rl.close();
  }
}

function decodeSse(buffer: string): { events: ChatEvent[]; rest: string } {
  const events: ChatEvent[] = [];
  while (true) {
    const boundary = /\r?\n\r?\n/.exec(buffer);
    if (!boundary) return { events, rest: buffer };
    const frame = buffer.slice(0, boundary.index);
    buffer = buffer.slice(boundary.index + boundary[0].length);
    const lines = frame.split(/\r?\n/);
    const event = lines
      .find((line) => line.startsWith('event:'))
      ?.slice(6)
      .trim();
    const data = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (event && data) events.push({ event, data: JSON.parse(data) } as ChatEvent);
  }
}

function citationUrl(api: string, citation: Citation): string {
  const origin = new URL(api).origin;
  return `${origin}/watch?id=${encodeURIComponent(citation.talkId)}&t=${citation.startMs}`;
}

async function ask(
  api: string,
  config: Config,
  query: string,
  scope: Scope,
  conversationId?: string,
  json = false,
): Promise<string> {
  if (!config.token) throw new CliError('请先运行 guyu login');
  const controller = new AbortController();
  const onSigint = () => controller.abort();
  process.once('SIGINT', onSigint);
  try {
    const response = await fetch(`${api}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Guyu-Client': 'cli',
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({ requestId: randomUUID(), conversationId, query, scope }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string; code?: string };
      throw new CliError(
        body.message || `请求失败，HTTP ${response.status}`,
        response.status,
        body.code,
      );
    }
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';
    let citations: Citation[] = [];
    let nextConversationId = conversationId || '';
    let completed = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = decodeSse(buffer);
      buffer = parsed.rest;
      for (const event of parsed.events) {
        if (event.event === 'meta') nextConversationId = event.data.conversationId;
        else if (event.event === 'citations') citations = event.data;
        else if (event.event === 'delta') {
          answer += event.data.text;
          if (!json) stdout.write(event.data.text);
        } else if (event.event === 'error') throw new CliError(event.data.message);
        else if (event.event === 'done') {
          if (event.data.state !== 'completed')
            throw new CliError('回答未完成，可在会话历史中查看已保存内容');
          completed = true;
        }
      }
    }
    if (!completed) throw new CliError('连接中断，可在会话历史中查看已保存内容');
    if (json)
      stdout.write(
        `${JSON.stringify({ answer, citations, conversationId: nextConversationId }, null, 2)}\n`,
      );
    else {
      stdout.write('\n');
      if (citations.length) {
        stdout.write('\n来源\n');
        for (const citation of citations) {
          const clock = `${Math.floor(citation.startMs / 60000)}:${String(Math.floor(citation.startMs / 1000) % 60).padStart(2, '0')}`;
          stdout.write(
            `[${citation.ref}] ${citation.title} · ${citation.speaker} · ${clock}\n${citationUrl(api, citation)}\n`,
          );
        }
      }
    }
    return nextConversationId;
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
}

async function interactive(api: string, config: Config, scope: Scope): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  let conversationId: string | undefined;
  stdout.write('进入谷雨连续对话。输入 /new 开启新会话，/quit 退出。\n');
  try {
    for (;;) {
      const query = (await rl.question('\n你：')).trim();
      if (!query) continue;
      if (query === '/quit' || query === '/exit') return;
      if (query === '/new') {
        conversationId = undefined;
        stdout.write('已开启新会话。\n');
        continue;
      }
      stdout.write('\n谷雨：');
      conversationId = await ask(api, config, query, scope, conversationId);
    }
  } finally {
    rl.close();
  }
}

async function search(api: string, config: Config, keyword: string, json: boolean): Promise<void> {
  if (!config.token) throw new CliError('请先运行 guyu login');
  const talks = await request<PublicTalk[]>(api, '/talks', config);
  const key = keyword.toLowerCase();
  const matched = talks.filter((talk) =>
    [talk.title, talk.speaker, talk.track, talk.description || ''].some((value) =>
      value.toLowerCase().includes(key),
    ),
  );
  if (json) stdout.write(`${JSON.stringify(matched, null, 2)}\n`);
  else if (!matched.length) stdout.write('没有匹配的内容。\n');
  else
    for (const talk of matched)
      stdout.write(
        `${talk.title}\n  ${talk.speaker} · ${talk.track}\n  ${new URL(api).origin}/watch?id=${encodeURIComponent(talk.id)}\n`,
      );
}

function help(): void {
  stdout.write(
    `谷雨 CLI\n\n用法\n  guyu login\n  guyu 你的问题\n  guyu                     进入连续对话\n  guyu search 关键词\n  guyu logout\n\n范围\n  --scope all|1|3|6|12\n  --talk talkId\n\n其他\n  --api https://example.com/api\n  --json\n`,
  );
}

async function main(): Promise<void> {
  const config = await loadConfig();
  const options = parseArgs(process.argv.slice(2), config);
  config.api = options.api;
  const [command, ...rest] = options.args;
  if (command === 'help' || command === '--help' || command === '-h') return help();
  if (command === 'login') return login(options.api, config);
  if (command === 'logout') {
    if (config.token)
      await request(options.api, '/auth/logout', config, { method: 'POST', body: '{}' });
    await rm(CONFIG_PATH, { force: true });
    stdout.write('已退出登录并删除本机凭据。\n');
    return;
  }
  if (command === 'search') return search(options.api, config, rest.join(' ').trim(), options.json);
  if (!command) return interactive(options.api, config, options.scope);
  await ask(
    options.api,
    config,
    [command, ...rest].join(' '),
    options.scope,
    undefined,
    options.json,
  );
}

main().catch((error) => {
  if ((error as Error).name === 'AbortError') {
    stdout.write('\n已停止。\n');
    process.exitCode = 130;
    return;
  }
  const message = error instanceof CliError ? error.message : '运行失败，请检查网络后重试';
  process.stderr.write(`谷雨：${message}\n`);
  process.exitCode = 1;
});
