import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// A rule pack is plain JSON data. It never contains code or regular expressions,
// so importing one from a stranger cannot run anything or hang the scanner.
export const RULE_TYPES = ['keyword', 'domain', 'username_contains', 'username_prefix', 'username_digits'];

export const BUNDLED_DIR = fileURLToPath(new URL('../rules', import.meta.url));
export const USER_DIR = 'data/packs';

const MAX_RULES = 500;
const MAX_BYTES = 200_000;

const str = (v, max, what) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error(`${what} 必須是 1-${max} 字的文字`);
  return v.trim();
};

// Validate and normalise untrusted pack JSON. Throws a readable Error on anything unexpected.
export function validatePack(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('規則包必須是 JSON 物件');
  const id = str(input.id, 60, 'id');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error('id 只能使用小寫英文、數字與連字號');
  if (!Array.isArray(input.rules) || !input.rules.length) throw new Error('rules 必須是非空陣列');
  if (input.rules.length > MAX_RULES) throw new Error(`規則最多 ${MAX_RULES} 條`);

  const rules = input.rules.map((r, i) => {
    const at = `rules[${i}]`;
    if (!r || typeof r !== 'object') throw new Error(`${at} 格式錯誤`);
    if (!RULE_TYPES.includes(r.type)) throw new Error(`${at}.type 必須是 ${RULE_TYPES.join(' / ')}`);
    const weight = Number(r.weight);
    if (!Number.isFinite(weight) || weight < 1 || weight > 60) throw new Error(`${at}.weight 必須介於 1-60`);
    const rule = { type: r.type, weight: Math.round(weight), reason: r.reason ? str(r.reason, 120, `${at}.reason`) : '' };
    if (r.type === 'username_digits') {
      const n = Number(r.value);
      if (!Number.isInteger(n) || n < 1 || n > 30) throw new Error(`${at}.value 必須是 1-30 的整數`);
      rule.value = n;
    } else {
      rule.value = str(r.value, 100, `${at}.value`).toLowerCase();
    }
    if (r.source) rule.source = str(r.source, 300, `${at}.source`);
    return rule;
  });

  return {
    id,
    name: input.name ? str(input.name, 80, 'name') : id,
    version: input.version ? str(String(input.version), 30, 'version') : '1',
    description: input.description ? str(input.description, 500, 'description') : '',
    source: input.source ? str(input.source, 300, 'source') : '',
    rules,
  };
}

const readDir = (dir, origin) => {
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const packs = [];
  for (const f of files) {
    try {
      packs.push({ ...validatePack(JSON.parse(readFileSync(join(dir, f), 'utf8'))), origin });
    } catch (e) {
      console.warn(`略過無效的規則包 ${f}：${e.message}`);
    }
  }
  return packs;
};

export function loadPacks({ bundledDir = BUNDLED_DIR, userDir = USER_DIR } = {}) {
  const user = readDir(userDir, 'user');
  const ids = new Set(user.map((p) => p.id));
  return [...readDir(bundledDir, 'bundled').filter((p) => !ids.has(p.id)), ...user];
}

export function savePack(pack, userDir = USER_DIR) {
  mkdirSync(userDir, { recursive: true });
  writeFileSync(join(userDir, `${pack.id}.json`), JSON.stringify(pack, null, 2));
}

export function removePack(id, userDir = USER_DIR) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error('id 格式錯誤');
  rmSync(join(userDir, `${id}.json`), { force: true });
}

// Import from pasted JSON text, or from an https URL (e.g. a raw GitHub file).
export async function fetchPackText(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error('網址格式錯誤');
  }
  const host = u.hostname;
  if (u.protocol !== 'https:') throw new Error('只接受 https 網址');
  if (host === 'localhost' || host.endsWith('.localhost') || /^[\d.]+$/.test(host) || host.includes(':')) {
    throw new Error('不接受本機或 IP 位址');
  }
  const res = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`下載失敗：HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error('檔案過大');
  return text;
}

export function parsePackText(text) {
  if (text.length > MAX_BYTES) throw new Error('內容過大');
  try {
    return validatePack(JSON.parse(text));
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error('不是有效的 JSON');
    throw e;
  }
}

export function compileRules(packs, disabled = []) {
  return packs
    .filter((p) => !disabled.includes(p.id))
    .flatMap((p) => p.rules.map((r) => ({ ...r, pack: p.name })));
}

// Returns [{ weight, reason }] for every rule the reply triggers.
export function matchRules(reply, rules) {
  const user = (reply.username || '').toLowerCase();
  const text = (reply.text || '').toLowerCase();
  const hits = [];
  for (const r of rules) {
    let hit = false;
    if (r.type === 'keyword') hit = text.includes(r.value);
    else if (r.type === 'domain') hit = new RegExp(`(^|[^a-z0-9-])${r.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9-])`).test(text);
    else if (r.type === 'username_contains') hit = user.includes(r.value);
    else if (r.type === 'username_prefix') hit = user.startsWith(r.value);
    else if (r.type === 'username_digits') hit = new RegExp(`\\d{${r.value},}`).test(user);
    if (hit) hits.push({ weight: r.weight, reason: `[${r.pack}] ${r.reason || `${r.type}: ${r.value}`}` });
  }
  return hits;
}
