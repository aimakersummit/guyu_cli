import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('bundled CLI works without runtime dependencies', () => {
  const result = execFileSync(process.execPath, ['dist/guyu.mjs', '--help'], { encoding: 'utf8' });
  assert.match(result, /guyu login/);
  assert.match(result, /guyu logout/);
});
test('login uses browser authorization rather than terminal SMS', () => {
  const source = readFileSync('src/browser-login.ts', 'utf8');
  assert.match(source, /digest\('base64url'\)/);
  assert.match(source, /server.listen\(0, '127.0.0.1'/);
  assert.match(source, /searchParams.get\('state'\) !== state/);
  assert.doesNotMatch(source, /setInterval|\/auth\/sms/);
});
test('default login returns a public URL and exits without opening a browser or waiting', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guyu-cli-agent-'));
  const config = join(dir, 'config.json');
  try {
    const result = JSON.parse(execFileSync(process.execPath, ['dist/guyu.mjs', 'login', '--json'], {
      env: { ...process.env, GUYU_CONFIG: config }, encoding: 'utf8', timeout: 3000,
    }));
    assert.equal(result.status, 'authorization_required');
    assert.equal(new URL(result.authorizationUrl).searchParams.get('authorize'), 'agent');
    assert.equal(new URL(result.authorizationUrl).searchParams.has('redirectUri'), false);
    assert.equal(JSON.stringify(result).includes('verifier'), false);
    assert.equal(statSync(config + '.login.json').mode & 0o777, 0o600);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
