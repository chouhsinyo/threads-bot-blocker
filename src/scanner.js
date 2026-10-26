import { scoreReply, statusFor } from './scoring.js';
import { aiJudge } from './ai.js';
import { compileRules, loadPacks } from './rulepacks.js';

// Fetch replies on recent posts, score them, and (optionally) auto-hide the clearly-bot ones.
export async function scan({ client, store, anthropicKey }) {
  const { settings, blacklist, whitelist } = store.db;
  const rules = compileRules(loadPacks(), settings.disabledPacks);
  const posts = await client.recentPosts(settings.postsToScan);

  const fetched = [];
  for (const post of posts) {
    for (const r of await client.replies(post.id)) {
      if (r.is_reply_owned_by_me) continue;
      fetched.push({ ...r, postId: post.id, postText: (post.text || '').slice(0, 80) });
    }
  }

  const summary = { scanned: fetched.length, flagged: 0, pending: 0, hidden: 0, errors: [] };

  for (const r of fetched) {
    const known = store.db.replies[r.id];
    // Respect decisions the user already made.
    if (known && ['kept', 'hidden', 'blocked'].includes(known.status)) continue;

    let { score, reasons } = scoreReply(r, { all: fetched, blacklist, whitelist, keywords: settings.keywords, rules });

    if (score >= 20 && score < settings.hideThreshold) {
      const ai = await aiJudge(r, anthropicKey);
      if (ai) {
        score = Math.round((score + ai.probability * 100) / 2);
        reasons = [...reasons, `AI ${Math.round(ai.probability * 100)}%：${ai.reason}`];
      }
    }

    let status = statusFor(score, settings);
    if (r.hide_status === 'HIDDEN') status = 'hidden';

    if (status === 'flagged' && settings.autoHide) {
      try {
        await client.hideReply(r.id, true);
        status = 'hidden';
        store.log('auto-hide', { id: r.id, username: r.username, score });
      } catch (e) {
        summary.errors.push(`${r.id}: ${e.message}`);
      }
    }

    store.db.replies[r.id] = {
      id: r.id, username: r.username, text: r.text, permalink: r.permalink, timestamp: r.timestamp,
      postId: r.postId, postText: r.postText, score, reasons, status,
    };
    if (status === 'flagged') summary.flagged++;
    else if (status === 'pending') summary.pending++;
    else if (status === 'hidden') summary.hidden++;
  }

  store.save();
  return summary;
}
