import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.js';
import { Store } from './store.js';
import { ThreadsClient } from './threads.js';
import { scan } from './scanner.js';

loadEnv();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = join(fileURLToPath(new URL('..', import.meta.url)), 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

const store = new Store();
const client = process.env.THREADS_ACCESS_TOKEN ? new ThreadsClient(process.env.THREADS_ACCESS_TOKEN) : null;
let scanning = false;

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

const readBody = async (req) => {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 1e6) throw new Error('body too large');
  }
  return data ? JSON.parse(data) : {};
};

const needClient = () => {
  if (!client) throw Object.assign(new Error('尚未設定 THREADS_ACCESS_TOKEN（請編輯 .env）'), { status: 400 });
  return client;
};

const counts = () => {
  const c = { flagged: 0, pending: 0, hidden: 0, kept: 0, clean: 0, blocked: 0 };
  for (const r of Object.values(store.db.replies)) c[r.status] = (c[r.status] || 0) + 1;
  return c;
};

async function setHidden(id, hide) {
  const r = store.db.replies[id];
  if (!r) throw Object.assign(new Error('找不到這則回覆'), { status: 404 });
  await needClient().hideReply(id, hide);
  r.status = hide ? 'hidden' : 'kept';
  store.log(hide ? 'hide' : 'unhide', { id, username: r.username });
}

const routes = {
  'GET /api/state': async () => ({
    configured: Boolean(client),
    ai: Boolean(process.env.ANTHROPIC_API_KEY),
    settings: store.db.settings,
    counts: counts(),
    blacklist: store.db.blacklist,
    whitelist: store.db.whitelist,
    log: store.db.log.slice(0, 50),
  }),

  'GET /api/replies': async (_req, url) => {
    const status = url.searchParams.get('status');
    return Object.values(store.db.replies)
      .filter((r) => !status || r.status === status)
      .sort((a, b) => b.score - a.score || Date.parse(b.timestamp) - Date.parse(a.timestamp));
  },

  'POST /api/scan': async () => {
    if (scanning) throw Object.assign(new Error('掃描進行中'), { status: 409 });
    scanning = true;
    try {
      return await scan({ client: needClient(), store, anthropicKey: process.env.ANTHROPIC_API_KEY });
    } finally {
      scanning = false;
    }
  },

  // body: { ids: [...], action: 'hide' | 'unhide' | 'keep' | 'blacklist' | 'blocked' }
  'POST /api/action': async (_req, _url, body) => {
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const results = { ok: 0, failed: [] };
    for (const id of ids) {
      const r = store.db.replies[id];
      try {
        if (!r) throw new Error('找不到這則回覆');
        if (body.action === 'hide') await setHidden(id, true);
        else if (body.action === 'unhide') await setHidden(id, false);
        else if (body.action === 'keep') {
          if (r.status === 'hidden') await setHidden(id, false);
          r.status = 'kept';
          const u = r.username.toLowerCase();
          if (body.whitelist && !store.db.whitelist.includes(u)) store.db.whitelist.push(u);
        } else if (body.action === 'blacklist') {
          const u = r.username.toLowerCase();
          if (!store.db.blacklist.includes(u)) store.db.blacklist.push(u);
          // hide every visible reply from this account
          for (const other of Object.values(store.db.replies)) {
            if (other.username.toLowerCase() === u && other.status !== 'hidden' && other.status !== 'blocked') {
              await setHidden(other.id, true);
            }
          }
          store.log('blacklist', { username: r.username });
        } else if (body.action === 'blocked') {
          // user has blocked this account inside Threads itself
          for (const other of Object.values(store.db.replies)) {
            if (other.username.toLowerCase() === r.username.toLowerCase()) other.status = 'blocked';
          }
          store.log('blocked', { username: r.username });
        } else throw new Error('未知的動作');
        results.ok++;
      } catch (e) {
        results.failed.push({ id, error: e.message });
      }
    }
    store.save();
    return results;
  },

  'POST /api/settings': async (_req, _url, body) => {
    const s = store.db.settings;
    if (typeof body.autoHide === 'boolean') s.autoHide = body.autoHide;
    for (const k of ['hideThreshold', 'reviewThreshold', 'postsToScan']) {
      if (Number.isFinite(body[k])) s[k] = Math.max(1, Math.min(k === 'postsToScan' ? 50 : 100, Math.round(body[k])));
    }
    if (Array.isArray(body.keywords)) s.keywords = body.keywords.map(String).map((k) => k.trim()).filter(Boolean);
    if (Array.isArray(body.blacklist)) store.db.blacklist = body.blacklist.map((u) => String(u).toLowerCase().replace(/^@/, '')).filter(Boolean);
    if (Array.isArray(body.whitelist)) store.db.whitelist = body.whitelist.map((u) => String(u).toLowerCase().replace(/^@/, '')).filter(Boolean);
    store.save();
    return { ok: true };
  },
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Local tool: reject DNS-rebinding and cross-site requests.
    const host = req.headers.host?.replace(/:\d+$/, '');
    if (host !== 'localhost' && host !== '127.0.0.1') return json(res, 403, { error: 'forbidden host' });
    if (req.method === 'POST') {
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'forbidden origin' });
    }

    const handler = routes[`${req.method} ${url.pathname}`];
    if (handler) {
      const body = req.method === 'POST' ? await readBody(req) : undefined;
      return json(res, 200, await handler(req, url, body));
    }

    if (req.method === 'GET') {
      const rel = url.pathname === '/' ? 'index.html' : normalize(url.pathname).replace(/^([/\\])+/, '');
      if (rel.includes('..')) return json(res, 403, { error: 'forbidden' });
      try {
        const file = await readFile(join(PUBLIC, rel));
        res.writeHead(200, { 'content-type': MIME[extname(rel)] || 'application/octet-stream' });
        return res.end(file);
      } catch {
        return json(res, 404, { error: 'not found' });
      }
    }
    json(res, 404, { error: 'not found' });
  } catch (e) {
    json(res, e.status || 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Threads Bot Blocker 已啟動： http://localhost:${PORT}`);
  if (!client) console.log('⚠ 尚未設定 THREADS_ACCESS_TOKEN，請先複製 .env.example 為 .env 並填入。');
});
