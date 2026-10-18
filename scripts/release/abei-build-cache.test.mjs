import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

test('optional low-space release clears only build caches between completed builds', () => {
  const source = readFileSync(new URL('./abei-server-release.sh', import.meta.url), 'utf8');
  const start = source.indexOf('prune_build_cache()');
  assert.ok(start >= 0, 'missing controlled cache cleanup');
  const block = source.slice(start, source.indexOf('\nstamp=', start));
  const directory = mkdtempSync(join(tmpdir(), 'abei-build-cache-'));
  try {
    for (const enabled of ['0', '1']) {
      const script = `set -euo pipefail
stage=/fixture
sha=fixture
docker() {
  printf '%s\\n' "$*" >> "$TRACE"
  if [[ "$*" == *'config --format json' ]]; then printf '%s\\n' '{"services":{"api-core":{"build":{"args":{"APP_VERSION":"0.0.16"}}}}}'; fi
}
${block}`;
      const trace = join(directory, enabled);
      const result = spawnSync('bash', ['-c', script], { env: { ...process.env, ABEI_PRUNE_BUILD_CACHE: enabled, TRACE: trace }, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      const calls = readFileSync(trace, 'utf8').trim().split('\n');
      const prunes = calls.filter(call => call === 'builder prune --all --force');
      assert.equal(prunes.length, enabled === '1' ? 2 : 0);
      if (enabled === '1') {
        const api = calls.findIndex(call => call.startsWith('buildx build'));
        const web = calls.findIndex(call => call.endsWith('build web ai-gateway'));
        assert.equal(calls[api + 1], 'builder prune --all --force');
        assert.equal(calls[web + 1], 'builder prune --all --force');
      }
      assert.ok(!calls.some(call => /volume|image rm|system prune/.test(call)));
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
