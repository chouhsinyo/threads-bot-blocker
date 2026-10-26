import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

export const DEFAULT_SETTINGS = {
  autoHide: false, // dry run by default: only flag, never hide on its own
  hideThreshold: 80,
  reviewThreshold: 40,
  postsToScan: 10,
  disabledPacks: [],
  keywords: [
    '加賴', '加line', 'line id', '私訊我', '私我', '博弈', '娛樂城', '投資', '帶單', '賺錢',
    '兼職', '免費領', 'telegram', 'whatsapp', 'crypto', 'dm me', 'click here', '點擊連結',
  ],
};

export class Store {
  constructor(path = 'data/db.json') {
    this.path = path;
    this.db = { replies: {}, blacklist: [], whitelist: [], settings: {}, log: [] };
    try {
      this.db = { ...this.db, ...JSON.parse(readFileSync(path, 'utf8')) };
    } catch {
      /* first run */
    }
    this.db.settings = { ...DEFAULT_SETTINGS, ...this.db.settings };
  }

  save() {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    renameSync(tmp, this.path);
  }

  log(action, detail) {
    this.db.log.unshift({ at: new Date().toISOString(), action, ...detail });
    this.db.log.length = Math.min(this.db.log.length, 500);
  }
}
