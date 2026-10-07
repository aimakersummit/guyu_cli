import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const entry = fileURLToPath(new URL('../dist/guyu.mjs', import.meta.url));
test('help and unauthenticated question do not call production services', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'guyu-cli-test-'));
  try {
    const env = { ...process.env, GUYU_CONFIG: join(dir, 'missing.json') };
    const help = spawnSync(process.execPath, [entry, '--help'], { env, encoding: 'utf8' });
    assert.equal(help.status, 0);
    assert.match(help.stdout, /谷雨 CLI/);
    const ask = spawnSync(process.execPath, [entry, '测试问题'], { env, encoding: 'utf8' });
    assert.equal(ask.status, 1);
    assert.match(ask.stderr, /请先运行 guyu login/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('JSON question preserves scope, answer and citations using a local mock', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'guyu-cli-test-'));
  let received;
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const part of req) body += part;
    received = { url: req.url, token: req.headers.authorization, body: JSON.parse(body) };
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const events = [
      ['meta', { conversationId: 'test-conversation' }],
      ['citations', [{ ref: 1, talkId: 'test-talk', title: '测试视频', speaker: '测试讲者', startMs: 1200 }]],
      ['delta', { text: '测试回答。' }], ['done', { state: 'completed' }],
    ];
    for (const [event, data] of events) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const config = join(dir, 'config.json');
    await writeFile(config, JSON.stringify({ api: `http://127.0.0.1:${server.address().port}/api`, token: 'test-token' }));
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [entry, '--json', '--scope', '3', '测试问题'], { env: { ...process.env, GUYU_CONFIG: config } });
      let stdout = '', stderr = '';
      child.stdout.on('data', value => stdout += value);
      child.stderr.on('data', value => stderr += value);
      child.on('error', reject);
      child.on('close', status => resolve({ status, stdout, stderr }));
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(received.url, '/api/chat');
    assert.equal(received.token, 'Bearer test-token');
    assert.deepEqual(received.body.scope, { type: 'recent', months: 3 });
    const output = JSON.parse(result.stdout);
    assert.equal(output.answer, '测试回答。');
    assert.equal(output.conversationId, 'test-conversation');
    assert.equal(output.citations[0].talkId, 'test-talk');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
