import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUNDLED_DIR, compileRules, fetchPackText, loadPacks, matchRules, parsePackText, removePack, savePack, validatePack } from '../src/rulepacks.js';
import { scoreReply } from '../src/scoring.js';

const pack = (rules, extra = {}) => ({ id: 'test-pack', name: '測試', rules, ...extra });

test('bundled packs are all valid', () => {
  const packs = loadPacks({ bundledDir: BUNDLED_DIR, userDir: join(tmpdir(), 'no-such-dir') });
  assert.ok(packs.length >= 1);
});

test('validatePack accepts a good pack and normalises it', () => {
  const p = validatePack(pack([{ type: 'keyword', value: ' 加賴 ', weight: '25.4' }]));
  assert.equal(p.rules[0].value, '加賴');
  assert.equal(p.rules[0].weight, 25);
});

test('validatePack rejects unknown rule types, including regex', () => {
  assert.throws(() => validatePack(pack([{ type: 'regex', value: '(a+)+$', weight: 10 }])), /type/);
});

test('validatePack rejects bad ids, weights and sizes', () => {
  assert.throws(() => validatePack(pack([{ type: 'keyword', value: 'x', weight: 10 }], { id: '../evil' })), /id/);
  assert.throws(() => validatePack(pack([{ type: 'keyword', value: 'x', weight: 999 }])), /weight/);
  assert.throws(() => validatePack(pack([])), /rules/);
  assert.throws(() => validatePack(pack(Array.from({ length: 501 }, () => ({ type: 'keyword', value: 'x', weight: 1 })))), /最多/);
  assert.throws(() => parsePackText('not json'), /JSON/);
});

test('matchRules covers every rule type', () => {
  const rules = compileRules([validatePack(pack([
    { type: 'keyword', value: '加賴', weight: 20 },
    { type: 'domain', value: 'spam.com', weight: 20 },
    { type: 'username_contains', value: 'liancui', weight: 15 },
    { type: 'username_prefix', value: 'bot_', weight: 15 },
    { type: 'username_digits', value: 4, weight: 10 },
  ]))]);
  const hit = (username, text) => matchRules({ username, text }, rules).length;
  assert.equal(hit('liancui86', '你好'), 1);
  assert.equal(hit('bot_x', '加賴我'), 2);
  assert.equal(hit('user12345', '看 http://spam.com/a'), 2);
  assert.equal(hit('user12', 'notspam.com'), 0, 'domain must not match a longer domain');
  assert.equal(hit('alice', '很棒'), 0);
});

test('pack rules feed into the reply score and show their pack name', () => {
  const rules = compileRules([validatePack(pack([{ type: 'keyword', value: '加賴', weight: 30, reason: '導流' }]))]);
  const r = { username: 'a', text: '加賴', timestamp: '2026-01-01T00:00:00Z' };
  const base = scoreReply(r, { all: [r], blacklist: [], whitelist: [], keywords: [] });
  const withPack = scoreReply(r, { all: [r], blacklist: [], whitelist: [], keywords: [], rules });
  assert.equal(withPack.score - base.score, 30);
  assert.ok(withPack.reasons.some((x) => x.includes('[測試]') && x.includes('導流')));
});

test('disabled packs are skipped', () => {
  const p = validatePack(pack([{ type: 'keyword', value: 'x', weight: 5 }]));
  assert.equal(compileRules([p], ['test-pack']).length, 0);
});

test('savePack / loadPacks / removePack round trip, and user packs override bundled ones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'packs-'));
  savePack(validatePack(pack([{ type: 'keyword', value: 'x', weight: 5 }])), dir);
  assert.equal(loadPacks({ bundledDir: join(dir, 'none'), userDir: dir }).length, 1);
  removePack('test-pack', dir);
  assert.equal(loadPacks({ bundledDir: join(dir, 'none'), userDir: dir }).length, 0);
  assert.throws(() => removePack('../x', dir), /id/);
});

test('fetchPackText refuses non-https, localhost and IP addresses', async () => {
  await assert.rejects(fetchPackText('http://example.com/p.json'), /https/);
  await assert.rejects(fetchPackText('https://localhost/p.json'), /本機/);
  await assert.rejects(fetchPackText('https://127.0.0.1/p.json'), /本機/);
  await assert.rejects(fetchPackText('https://[::1]/p.json'), /本機/);
  await assert.rejects(fetchPackText('not a url'), /網址/);
});
