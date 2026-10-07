import { createHash, randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

type Pending = { api: string; requestId: string; verifier: string; expiresAt: number };
export async function beginAgentLogin(api: string, pendingPath: string) {
  let pending: Pending | undefined;
  try { pending = JSON.parse(await readFile(pendingPath, 'utf8')); } catch { /* 首次授权。 */ }
  if (!pending || pending.api !== api || !Number.isFinite(pending.expiresAt) || pending.expiresAt <= Date.now() ||
    !/^[A-Za-z0-9_-]{43}$/.test(pending.requestId || '') || !/^[A-Za-z0-9_-]{43}$/.test(pending.verifier || '')) {
    pending = { api, requestId: randomBytes(32).toString('base64url'), verifier: randomBytes(32).toString('base64url'), expiresAt: Date.now() + 600000 };
    await mkdir(dirname(pendingPath), { recursive: true, mode: 0o700 });
    await writeFile(pendingPath, JSON.stringify(pending), { mode: 0o600 });
    await chmod(pendingPath, 0o600);
  }
  const url = new URL('/cli', api);
  url.search = new URLSearchParams({ authorize: 'agent', requestId: pending.requestId,
    challenge: createHash('sha256').update(pending.verifier).digest('base64url'), expiresAt: String(pending.expiresAt) }).toString();
  return { status: 'authorization_required', authorizationUrl: url.href, expiresAt: pending.expiresAt,
    instruction: '将 authorizationUrl 作为可点击链接发给用户。不要要求用户打开终端或运行命令。用户确认网页授权后，再执行 guyu login finish --json 一次，禁止循环轮询。' };
}

export async function finishAgentLogin(pendingPath: string): Promise<
  { status: 'pending' | 'denied' } | { status: 'authorized'; api: string; token: string; expiresAt: number }
> {
  let pending: Pending;
  try { pending = JSON.parse(await readFile(pendingPath, 'utf8')); }
  catch { throw new Error('没有待完成的授权，请先发起登录'); }
  if (pending.expiresAt <= Date.now()) {
    await rm(pendingPath, { force: true });
    throw new Error('授权链接已过期，请重新发起登录');
  }
  const response = await fetch(`${pending.api}/auth/cli/device/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Guyu-Client': 'cli' },
    body: JSON.stringify({ requestId: pending.requestId, verifier: pending.verifier }), signal: AbortSignal.timeout(15000),
  });
  const result = await response.json() as { status?: string; token?: string; expiresAt?: number; message?: string; code?: string };
  if (!response.ok) {
    if (result.code === 'INVALID_GRANT') await rm(pendingPath, { force: true });
    throw new Error(result.message || '授权领取失败');
  }
  if (result.status === 'pending') return { status: 'pending' };
  if (result.status === 'denied') { await rm(pendingPath, { force: true }); return { status: 'denied' }; }
  if (result.status !== 'authorized' || !result.token || !result.expiresAt) throw new Error('授权响应无效');
  return { status: 'authorized', api: pending.api, token: result.token, expiresAt: result.expiresAt };
}
