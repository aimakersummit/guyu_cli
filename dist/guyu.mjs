#!/usr/bin/env node

// src/index.ts
import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
var DEFAULT_API = "https://ask.aimakersummit.com/api";
var CONFIG_PATH = process.env.GUYU_CONFIG?.trim() || join(homedir(), ".config", "guyu", "config.json");
var CliError = class extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
};
async function loadConfig() {
  try {
    const parsed = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
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
  await mkdir(dirname(CONFIG_PATH), { recursive: true, mode: 448 });
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}
`, { mode: 384 });
  await chmod(CONFIG_PATH, 384);
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
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const phone = (await rl.question("\u624B\u673A\u53F7\uFF1A")).trim();
    await request(
      api,
      "/auth/sms/send",
      { api },
      {
        method: "POST",
        body: JSON.stringify({ phone })
      }
    );
    const code = (await rl.question("\u77ED\u4FE1\u9A8C\u8BC1\u7801\uFF1A")).trim();
    const result = await request(
      api,
      "/auth/sms/verify",
      { api },
      {
        method: "POST",
        body: JSON.stringify({ phone, code })
      }
    );
    if (!result.token) throw new CliError("\u767B\u5F55\u6210\u529F\uFF0C\u4F46\u670D\u52A1\u7AEF\u6CA1\u6709\u8FD4\u56DE CLI \u51ED\u636E\uFF0C\u8BF7\u66F4\u65B0\u670D\u52A1\u7AEF");
    await saveConfig({ api, token: result.token, expiresAt: result.expiresAt });
    stdout.write("\u767B\u5F55\u6210\u529F\uFF0C\u51ED\u636E\u5DF2\u5B89\u5168\u4FDD\u5B58\u5728\u672C\u673A\u3002\n");
  } finally {
    rl.close();
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
  guyu login
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
  if (command === "login") return login(options.api, config);
  if (command === "logout") {
    if (config.token)
      await request(options.api, "/auth/logout", config, { method: "POST", body: "{}" });
    await rm(CONFIG_PATH, { force: true });
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
//# sourceMappingURL=guyu.mjs.map
