const norm = (s = '') => s.toLowerCase().replace(/\s+/g, ' ').trim();

// Rule-based bot score, 0-100, with human-readable reasons.
// `all` is every reply seen in this scan, used for duplicate / burst detection.
export function scoreReply(reply, { all, blacklist, whitelist, keywords }) {
  const user = (reply.username || '').toLowerCase();
  if (whitelist.includes(user)) return { score: 0, reasons: ['白名單'] };
  if (blacklist.includes(user)) return { score: 100, reasons: ['黑名單'] };

  const text = reply.text || '';
  const t = norm(text);
  let score = 0;
  const reasons = [];
  const add = (n, why) => {
    score += n;
    reasons.push(why);
  };

  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|io|me|cc|xyz|top|vip)\b/i.test(text)) add(30, '含外部連結');

  const hit = keywords.filter((k) => k && t.includes(k.toLowerCase()));
  if (hit.length) add(Math.min(40, 25 + 10 * (hit.length - 1)), `關鍵字：${hit.slice(0, 3).join('、')}`);

  const dupUsers = new Set(all.filter((r) => norm(r.text) === t && t.length > 3).map((r) => r.username));
  if (dupUsers.size >= 2) add(35, `${dupUsers.size} 個帳號留了相同內容`);

  const mine = all.filter((r) => r.username === reply.username);
  if (mine.length >= 3) {
    const times = mine.map((r) => Date.parse(r.timestamp)).sort((a, b) => a - b);
    if (times.length >= 3 && times[2] - times[0] <= 10 * 60_000) add(20, '10 分鐘內連續留言 3 則以上');
  }

  if (/\d{5,}$/.test(user)) add(15, '帳號名稱結尾為長串數字');

  const emojis = (text.match(/\p{Extended_Pictographic}/gu) || []).length;
  if (emojis >= 5 && text.replace(/\p{Extended_Pictographic}|\s/gu, '').length < 5) add(10, '幾乎只有表情符號');

  return { score: Math.min(100, score), reasons };
}

export function statusFor(score, settings) {
  if (score >= settings.hideThreshold) return 'flagged';
  if (score >= settings.reviewThreshold) return 'pending';
  return 'clean';
}
