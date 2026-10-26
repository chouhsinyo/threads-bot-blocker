const BASE = 'https://graph.threads.net/v1.0';

const REPLY_FIELDS = 'id,text,username,permalink,timestamp,hide_status,is_reply_owned_by_me';

export class ThreadsClient {
  constructor(token) {
    this.token = token;
  }

  async #request(path, { method = 'GET', params = {} } = {}) {
    const url = new URL(`${BASE}/${path}`);
    const body = new URLSearchParams({ access_token: this.token });
    if (method === 'GET') {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      url.searchParams.set('access_token', this.token);
    } else {
      for (const [k, v] of Object.entries(params)) body.set(k, v);
    }
    const res = await fetch(url, method === 'GET' ? {} : { method, body });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json?.error?.message || `HTTP ${res.status}`;
      const err = new Error(`Threads API: ${msg}`);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  me() {
    return this.#request('me', { params: { fields: 'id,username' } });
  }

  async recentPosts(limit = 10) {
    const json = await this.#request('me/threads', { params: { fields: 'id,text,permalink,timestamp', limit } });
    return json.data ?? [];
  }

  // Top-level replies of one post, following pagination up to maxPages.
  async replies(postId, maxPages = 5) {
    const out = [];
    let params = { fields: REPLY_FIELDS, limit: 100 };
    for (let page = 0; page < maxPages; page++) {
      const json = await this.#request(`${postId}/replies`, { params });
      out.push(...(json.data ?? []));
      const after = json.paging?.cursors?.after;
      if (!json.paging?.next || !after) break;
      params = { ...params, after };
    }
    return out;
  }

  hideReply(replyId, hide = true) {
    return this.#request(`${replyId}/manage_reply`, { method: 'POST', params: { hide: String(hide) } });
  }
}
