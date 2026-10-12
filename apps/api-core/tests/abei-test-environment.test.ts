import assert from 'node:assert/strict';
import test from 'node:test';
test('isolated test guard rejects production, other local databases and unsafe listener ports', async () => {
  const mod = await import('./helpers/abei-test-environment.js').catch(() => null);
  assert.ok(mod?.assertCreatorTestDatabase, 'isolated guard required');
  for (const url of ['postgresql://test@127.0.0.1:3604/abei', 'postgresql://test@127.0.0.1:3668/abei', 'postgresql://test@remote:3668/abei_creator_clean', 'postgresql://test@127.0.0.1:3324/xueleai']) assert.throws(() => mod.assertCreatorTestDatabase(url));
  mod.assertCreatorTestDatabase('postgresql://test@127.0.0.1:3668/abei_creator_clean');
  assert.equal(mod.creatorTestHttpPort('3664'),3664);
  for (const port of ['3000','3604','3668','3669','3681','0','bad']) assert.throws(() => mod.creatorTestHttpPort(port));
});
