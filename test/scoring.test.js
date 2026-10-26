import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreReply, statusFor } from '../src/scoring.js';
import { DEFAULT_SETTINGS } from '../src/store.js';

const ctx = (all, extra = {}) => ({ all, blacklist: [], whitelist: [], keywords: DEFAULT_SETTINGS.keywords, ...extra });
const reply = (username, text, timestamp = '2026-01-01T00:00:00Z') => ({ username, text, timestamp });

test('genuine reply scores low', () => {
  const r = reply('alice', '這篇寫得很好，謝謝分享！');
  assert.ok(scoreReply(r, ctx([r])).score < DEFAULT_SETTINGS.reviewThreshold);
});

test('link plus spam keyword is flagged', () => {
  const r = reply('bot12345678', '想賺錢嗎？加賴 https://spam.example.com');
  const { score, reasons } = scoreReply(r, ctx([r]));
  assert.ok(score >= DEFAULT_SETTINGS.hideThreshold, `score ${score}`);
  assert.ok(reasons.length >= 3);
});

test('same text from different accounts is suspicious', () => {
  const a = reply('u1', 'check my profile for a gift');
  const b = reply('u2', 'Check my profile for a gift');
  assert.ok(scoreReply(a, ctx([a, b])).reasons.some((x) => x.includes('相同內容')));
});

test('burst of replies from one account', () => {
  const all = [0, 1, 2].map((i) => reply('spammer', `hello ${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()));
  assert.ok(scoreReply(all[0], ctx(all)).reasons.some((x) => x.includes('連續留言')));
});

test('whitelist and blacklist override rules', () => {
  const r = reply('Friend', '加賴 https://x.com');
  assert.equal(scoreReply(r, ctx([r], { whitelist: ['friend'] })).score, 0);
  assert.equal(scoreReply(reply('Bad', 'hi'), ctx([], { blacklist: ['bad'] })).score, 100);
});

test('statusFor respects thresholds', () => {
  assert.equal(statusFor(90, DEFAULT_SETTINGS), 'flagged');
  assert.equal(statusFor(50, DEFAULT_SETTINGS), 'pending');
  assert.equal(statusFor(10, DEFAULT_SETTINGS), 'clean');
});
