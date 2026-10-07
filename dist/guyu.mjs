#!/usr/bin/env node

// ../../Downloads/guyu-cli-github-0.3.0/src/index.ts
import { randomUUID } from "node:crypto";
import { chmod as chmod2, mkdir as mkdir2, readFile as readFile2, rm as rm2, writeFile as writeFile2 } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname as dirname2, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

// ../../Downloads/guyu-cli-github-0.3.0/src/browser-login.ts
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
function openBrowser(url) {
  const program = process.platform === "darwin" ? "open" : process.platform === "win32" ? "rundll32" : "xdg-open";
  const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  const child = spawn(program, args, { stdio: "ignore", detached: true });
  child.on("error", () => {
  });
  child.unref();
}
async function browserLogin(api, options = {}) {
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const controller = new AbortController();
  let resolveCode;
  let rejectCode;
  const codeReady = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  void codeReady.catch(() => {
  });
  let received = false;
  const server = createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
    const callback = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method !== "GET" || callback.pathname !== "/callback") {
      res.writeHead(404).end();
      return;
    }
    if (received || callback.searchParams.get("state") !== state) {
      res.writeHead(400).end("Invalid authorization callback");
      return;
    }
    if (callback.searchParams.get("error") === "access_denied") {
      received = true;
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end("\u5DF2\u53D6\u6D88\u8C37\u96E8 CLI \u6388\u6743\uFF0C\u53EF\u4EE5\u5173\u95ED\u6B64\u9875\u9762\u3002");
      rejectCode(new Error("\u4F60\u5DF2\u53D6\u6D88 CLI \u6388\u6743"));
      return;
    }
    if (!/^[A-Za-z0-9_-]{43}$/.test(callback.searchParams.get("code") || "")) {
      res.writeHead(400).end("Invalid authorization callback");
      return;
    }
    received = true;
    resolveCode(callback.searchParams.get("code"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end('<!doctype html><meta name="viewport" content="width=device-width"><title>\u8C37\u96E8 CLI</title><body style="font:16px/1.8 system-ui;padding:48px"><h1>\u6388\u6743\u5DF2\u63A5\u6536</h1><p>\u8BF7\u56DE\u5230 Agent \u6216\u7EC8\u7AEF\u67E5\u770B\u767B\u5F55\u7ED3\u679C\u3002\u53EF\u4EE5\u5173\u95ED\u6B64\u9875\u9762\u3002</p>');
  });
  const interrupted = () => {
    controller.abort();
    rejectCode(new Error("\u767B\u5F55\u5DF2\u53D6\u6D88"));
  };
  const timer = setTimeout(() => {
    controller.abort();
    rejectCode(new Error("\u767B\u5F55\u7B49\u5F85\u8D85\u65F6\uFF0C\u8BF7\u91CD\u65B0\u8FD0\u884C guyu login"));
  }, options.timeoutMs ?? 3e5);
  process.once("SIGINT", interrupted);
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const redirectUri = `http://127.0.0.1:${server.address().port}/callback`;
    const url = new URL("/cli", api);
    url.search = new URLSearchParams({ authorize: "1", redirectUri, challenge, state }).toString();
    options.announce?.(url.href);
    (options.open ?? openBrowser)(url.href);
    const code = await codeReady;
    const response = await fetch(`${api}/auth/cli/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Guyu-Client": "cli" },
      body: JSON.stringify({ code, verifier, redirectUri }),
      signal: controller.signal
    });
    const result = await response.json();
    if (!response.ok || !result.token || !result.expiresAt) throw new Error(result.message || "\u6388\u6743\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55");
    return { token: result.token, expiresAt: result.expiresAt };
  } finally {
    clearTimeout(timer);
    process.removeListener("SIGINT", interrupted);
    server.closeAllConnections();
    if (server.listening) await new Promise((resolve) => server.close(() => resolve()));
  }
}

// ../../Downloads/guyu-cli-github-0.3.0/src/agent-login.ts
import { createHash as createHash2, randomBytes as randomBytes2 } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
async function beginAgentLogin(api, pendingPath) {
  let pending;
  try {
    pending = JSON.parse(await readFile(pendingPath, "utf8"));
  } catch {
  }
  if (!pending || pending.api !== api || !Number.isFinite(pending.expiresAt) || pending.expiresAt <= Date.now() || !/^[A-Za-z0-9_-]{43}$/.test(pending.requestId || "") || !/^[A-Za-z0-9_-]{43}$/.test(pending.verifier || "")) {
    pending = { api, requestId: randomBytes2(32).toString("base64url"), verifier: randomBytes2(32).toString("base64url"), expiresAt: Date.now() + 6e5 };
    await mkdir(dirname(pendingPath), { recursive: true, mode: 448 });
    await writeFile(pendingPath, JSON.stringify(pending), { mode: 384 });
    await chmod(pendingPath, 384);
  }
  const url = new URL("/cli", api);
  url.search = new URLSearchParams({
    authorize: "agent",
    requestId: pending.requestId,
    challenge: createHash2("sha256").update(pending.verifier).digest("base64url"),
    expiresAt: String(pending.expiresAt)
  }).toString();
  return {
    status: "authorization_required",
    authorizationUrl: url.href,
    expiresAt: pending.expiresAt,
    instruction: "\u5C06 authorizationUrl \u4F5C\u4E3A\u53EF\u70B9\u51FB\u94FE\u63A5\u53D1\u7ED9\u7528\u6237\u3002\u4E0D\u8981\u8981\u6C42\u7528\u6237\u6253\u5F00\u7EC8\u7AEF\u6216\u8FD0\u884C\u547D\u4EE4\u3002\u7528\u6237\u786E\u8BA4\u7F51\u9875\u6388\u6743\u540E\uFF0C\u518D\u6267\u884C guyu login finish --json \u4E00\u6B21\uFF0C\u7981\u6B62\u5FAA\u73AF\u8F6E\u8BE2\u3002"
  };
}
async function finishAgentLogin(pendingPath) {
  let pending;
  try {
    pending = JSON.parse(await readFile(pendingPath, "utf8"));
  } catch {
    throw new Error("\u6CA1\u6709\u5F85\u5B8C\u6210\u7684\u6388\u6743\uFF0C\u8BF7\u5148\u53D1\u8D77\u767B\u5F55");
  }
  if (pending.expiresAt <= Date.now()) {
    await rm(pendingPath, { force: true });
    throw new Error("\u6388\u6743\u94FE\u63A5\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u53D1\u8D77\u767B\u5F55");
  }
  const response = await fetch(`${pending.api}/auth/cli/device/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Guyu-Client": "cli" },
    body: JSON.stringify({ requestId: pending.requestId, verifier: pending.verifier }),
    signal: AbortSignal.timeout(15e3)
  });
  const result = await response.json();
  if (!response.ok) {
    if (result.code === "INVALID_GRANT") await rm(pendingPath, { force: true });
    throw new Error(result.message || "\u6388\u6743\u9886\u53D6\u5931\u8D25");
  }
  if (result.status === "pending") return { status: "pending" };
  if (result.status === "denied") {
    await rm(pendingPath, { force: true });
    return { status: "denied" };
  }
  if (result.status !== "authorized" || !result.token || !result.expiresAt) throw new Error("\u6388\u6743\u54CD\u5E94\u65E0\u6548");
  return { status: "authorized", api: pending.api, token: result.token, expiresAt: result.expiresAt };
}

// ../../Downloads/guyu-cli-github-0.3.0/src/index.ts
var DEFAULT_API = "https://ask.aimakersummit.com/api";
var CONFIG_PATH = process.env.GUYU_CONFIG?.trim() || join(homedir(), ".config", "guyu", "config.json");
var PENDING_PATH = `${CONFIG_PATH}.login.json`;
var CliError = class extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
};
async function loadConfig() {
  try {
    const parsed = JSON.parse(await readFile2(CONFIG_PATH, "utf8"));
    return {
      api: cleanApi(parsed.api || DEFAULT_API),
      token: parsed.token,
      expiresAt: parsed.expiresAt
    };
  } catch {
    return { api: DEFAULT_API };
  }
}
async function saveConfig(config) {
  await mkdir2(dirname2(CONFIG_PATH), { recursive: true, mode: 448 });
  await writeFile2(CONFIG_PATH, `${JSON.stringify(config, null, 2)}
`, { mode: 384 });
  await chmod2(CONFIG_PATH, 384);
}
function cleanApi(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)))
    throw new CliError("\u670D\u52A1\u5730\u5740\u9700\u8981\u4F7F\u7528 HTTPS\uFF0C\u672C\u5730\u8C03\u8BD5\u53EF\u4EE5\u4F7F\u7528 HTTP");
  const url = value.replace(/\/+$/, "");
  return url.endsWith("/api") ? url : `${url}/api`;
}
function parseArgs(argv, config) {
  let api = config.api;
  let scope = { type: "all" };
  let json = false;
  const args = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--api") api = cleanApi(argv[++i] || "");
    else if (arg === "--scope") {
      const value = argv[++i];
      if (value === "all") scope = { type: "all" };
      else if (["1", "3", "6", "12"].includes(value || ""))
        scope = { type: "recent", months: Number(value) };
      else throw new CliError("--scope \u53EA\u652F\u6301 all\u30011\u30013\u30016\u300112");
    } else if (arg === "--talk") {
      const talkId = argv[++i];
      if (!talkId) throw new CliError("--talk \u540E\u9700\u8981 talkId");
      scope = { type: "talk", talkId };
    } else if (arg === "--json") json = true;
    else args.push(arg);
  }
  return { api, scope, json, args };
}
async function request(api, path, config, init = {}) {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Guyu-Client": "cli",
      ...config.token ? { Authorization: `Bearer ${config.token}` } : {},
      ...init.headers
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new CliError(
      data.message || `\u8BF7\u6C42\u5931\u8D25\uFF0CHTTP ${response.status}`,
      response.status,
      data.code
    );
  return data;
}
async function login(api, config) {
  try {
    const result = await browserLogin(api, { announce: (url) => stdout.write(`\u8BF7\u5728\u6D4F\u89C8\u5668\u4E2D\u786E\u8BA4\u6388\u6743\u3002\u82E5\u672A\u81EA\u52A8\u6253\u5F00\uFF0C\u8BF7\u5728\u672C\u673A\u6D4F\u89C8\u5668\u8BBF\u95EE\uFF1A
${url}
`) });
    await saveConfig({ api, token: result.token, expiresAt: result.expiresAt });
    stdout.write("\u767B\u5F55\u6210\u529F\uFF0C\u51ED\u636E\u5DF2\u5B89\u5168\u4FDD\u5B58\u5728\u672C\u673A\u3002\n");
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : "\u767B\u5F55\u5931\u8D25");
  }
}
function decodeSse(buffer) {
  const events = [];
  while (true) {
    const boundary = /\r?\n\r?\n/.exec(buffer);
    if (!boundary) return { events, rest: buffer };
    const frame = buffer.slice(0, boundary.index);
    buffer = buffer.slice(boundary.index + boundary[0].length);
    const lines = frame.split(/\r?\n/);
    const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
    const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (event && data) events.push({ event, data: JSON.parse(data) });
  }
}
function citationUrl(api, citation) {
  const origin = new URL(api).origin;
  return `${origin}/watch?id=${encodeURIComponent(citation.talkId)}&t=${citation.startMs}`;
}
async function ask(api, config, query, scope, conversationId, json = false) {
  if (!config.token) throw new CliError("\u8BF7\u5148\u8FD0\u884C guyu login");
  const controller = new AbortController();
  const onSigint = () => controller.abort();
  process.once("SIGINT", onSigint);
  try {
    const response = await fetch(`${api}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Guyu-Client": "cli",
        Authorization: `Bearer ${config.token}`
      },
      body: JSON.stringify({ requestId: randomUUID(), conversationId, query, scope }),
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new CliError(
        body.message || `\u8BF7\u6C42\u5931\u8D25\uFF0CHTTP ${response.status}`,
        response.status,
        body.code
      );
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer = "";
    let citations = [];
    let nextConversationId = conversationId || "";
    let completed = false;
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = decodeSse(buffer);
      buffer = parsed.rest;
      for (const event of parsed.events) {
        if (event.event === "meta") nextConversationId = event.data.conversationId;
        else if (event.event === "citations") citations = event.data;
        else if (event.event === "delta") {
          answer += event.data.text;
          if (!json) stdout.write(event.data.text);
        } else if (event.event === "error") throw new CliError(event.data.message);
        else if (event.event === "done") {
          if (event.data.state !== "completed")
            throw new CliError("\u56DE\u7B54\u672A\u5B8C\u6210\uFF0C\u53EF\u5728\u4F1A\u8BDD\u5386\u53F2\u4E2D\u67E5\u770B\u5DF2\u4FDD\u5B58\u5185\u5BB9");
          completed = true;
        }
      }
    }
    if (!completed) throw new CliError("\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u53EF\u5728\u4F1A\u8BDD\u5386\u53F2\u4E2D\u67E5\u770B\u5DF2\u4FDD\u5B58\u5185\u5BB9");
    if (json)
      stdout.write(
        `${JSON.stringify({ answer, citations, conversationId: nextConversationId }, null, 2)}
`
      );
    else {
      stdout.write("\n");
      if (citations.length) {
        stdout.write("\n\u6765\u6E90\n");
        for (const citation of citations) {
          const clock = `${Math.floor(citation.startMs / 6e4)}:${String(Math.floor(citation.startMs / 1e3) % 60).padStart(2, "0")}`;
          stdout.write(
            `[${citation.ref}] ${citation.title} \xB7 ${citation.speaker} \xB7 ${clock}
${citationUrl(api, citation)}
`
          );
        }
      }
    }
    return nextConversationId;
  } finally {
    process.removeListener("SIGINT", onSigint);
  }
}
async function interactive(api, config, scope) {
  const rl = createInterface({ input: stdin, output: stdout });
  let conversationId;
  stdout.write("\u8FDB\u5165\u8C37\u96E8\u8FDE\u7EED\u5BF9\u8BDD\u3002\u8F93\u5165 /new \u5F00\u542F\u65B0\u4F1A\u8BDD\uFF0C/quit \u9000\u51FA\u3002\n");
  try {
    for (; ; ) {
      const query = (await rl.question("\n\u4F60\uFF1A")).trim();
      if (!query) continue;
      if (query === "/quit" || query === "/exit") return;
      if (query === "/new") {
        conversationId = void 0;
        stdout.write("\u5DF2\u5F00\u542F\u65B0\u4F1A\u8BDD\u3002\n");
        continue;
      }
      stdout.write("\n\u8C37\u96E8\uFF1A");
      conversationId = await ask(api, config, query, scope, conversationId);
    }
  } finally {
    rl.close();
  }
}
async function search(api, config, keyword, json) {
  if (!config.token) throw new CliError("\u8BF7\u5148\u8FD0\u884C guyu login");
  const talks = await request(api, "/talks", config);
  const key = keyword.toLowerCase();
  const matched = talks.filter(
    (talk) => [talk.title, talk.speaker, talk.track, talk.description || ""].some(
      (value) => value.toLowerCase().includes(key)
    )
  );
  if (json) stdout.write(`${JSON.stringify(matched, null, 2)}
`);
  else if (!matched.length) stdout.write("\u6CA1\u6709\u5339\u914D\u7684\u5185\u5BB9\u3002\n");
  else
    for (const talk of matched)
      stdout.write(
        `${talk.title}
  ${talk.speaker} \xB7 ${talk.track}
  ${new URL(api).origin}/watch?id=${encodeURIComponent(talk.id)}
`
      );
}
function help() {
  stdout.write(
    `\u8C37\u96E8 CLI

\u7528\u6CD5
  guyu login               \u4E3A Agent \u751F\u6210\u6388\u6743\u94FE\u63A5\u5E76\u9000\u51FA
  guyu login finish        \u7528\u6237\u7F51\u9875\u6388\u6743\u540E\u9886\u53D6\u7ED3\u679C\u4E00\u6B21
  guyu login cancel        \u53D6\u6D88\u5F85\u5B8C\u6210\u7684\u767B\u5F55
  guyu \u4F60\u7684\u95EE\u9898
  guyu                     \u8FDB\u5165\u8FDE\u7EED\u5BF9\u8BDD
  guyu search \u5173\u952E\u8BCD
  guyu logout

\u8303\u56F4
  --scope all|1|3|6|12
  --talk talkId

\u5176\u4ED6
  --api https://example.com/api
  --json
`
  );
}
async function main() {
  const config = await loadConfig();
  const options = parseArgs(process.argv.slice(2), config);
  config.api = options.api;
  const [command, ...rest] = options.args;
  if (command === "help" || command === "--help" || command === "-h") return help();
  if (command === "login") {
    try {
      if (rest[0] === "browser") return await login(options.api, config);
      if (rest[0] === "cancel") {
        await rm2(PENDING_PATH, { force: true });
        stdout.write(`${JSON.stringify({ status: "cancelled" })}
`);
        return;
      }
      if (rest[0] === "finish") {
        const result = await finishAgentLogin(PENDING_PATH);
        if (result.status === "authorized") {
          await saveConfig({ api: result.api, token: result.token, expiresAt: result.expiresAt });
          await rm2(PENDING_PATH, { force: true });
          stdout.write(`${JSON.stringify({ status: "authorized", message: "\u767B\u5F55\u6210\u529F" })}
`);
        } else stdout.write(`${JSON.stringify({ status: result.status, message: result.status === "pending" ? "\u7528\u6237\u5C1A\u672A\u786E\u8BA4\u6388\u6743\u3002\u7B49\u5F85\u7528\u6237\u56DE\u590D\u540E\u518D\u9886\u53D6\uFF0C\u4E0D\u8981\u8F6E\u8BE2\u3002" : "\u7528\u6237\u5DF2\u53D6\u6D88\u6388\u6743" })}
`);
        return;
      }
      if (rest.length) throw new CliError("\u767B\u5F55\u53C2\u6570\u4E0D\u6B63\u786E");
      stdout.write(`${JSON.stringify(await beginAgentLogin(options.api, PENDING_PATH))}
`);
      return;
    } catch (error) {
      throw new CliError(error instanceof Error ? error.message : "\u767B\u5F55\u5931\u8D25");
    }
  }
  if (command === "logout") {
    if (config.token)
      await request(options.api, "/auth/logout", config, { method: "POST", body: "{}" });
    await rm2(CONFIG_PATH, { force: true });
    await rm2(PENDING_PATH, { force: true });
    stdout.write("\u5DF2\u9000\u51FA\u767B\u5F55\u5E76\u5220\u9664\u672C\u673A\u51ED\u636E\u3002\n");
    return;
  }
  if (command === "search") return search(options.api, config, rest.join(" ").trim(), options.json);
  if (!command) return interactive(options.api, config, options.scope);
  await ask(
    options.api,
    config,
    [command, ...rest].join(" "),
    options.scope,
    void 0,
    options.json
  );
}
main().catch((error) => {
  if (error.name === "AbortError") {
    stdout.write("\n\u5DF2\u505C\u6B62\u3002\n");
    process.exitCode = 130;
    return;
  }
  const message = error instanceof CliError ? error.message : "\u8FD0\u884C\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5";
  process.stderr.write(`\u8C37\u96E8\uFF1A${message}
`);
  process.exitCode = 1;
});
