import { Router } from 'express';
import pool from '../db.js';
import requireAuth from '../middleware/requireAuth.js';
import { verifyAccessToken } from '../auth/tokens.js';

const router = Router();

const ALLOWED_EMOJI = ['👍', '👎', '❤️', '😂', '🎉', '😮', '😢', '🔥'];
const TITLE_MAX = 150;
const BODY_MAX = 8000;

// Thread/reply reads are public (no account needed to browse) — only
// posting requires one. This middleware never rejects a request; it just
// sets req.userId when a valid bearer token is present, so a signed-in
// visitor's own reactions can be marked `reacted: true` without forcing
// everyone else to sign in just to read.
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try { req.userId = verifyAccessToken(token).sub; } catch { /* treat as anonymous */ }
  }
  next();
}

async function isAdmin(userId) {
  if (!userId) return false;
  const { rows } = await pool.query(`SELECT is_admin FROM users WHERE id = $1`, [userId]);
  return !!rows[0]?.is_admin;
}

async function reactionsFor(column, id, userId) {
  const { rows } = await pool.query(
    `SELECT emoji, COUNT(*)::int AS count, BOOL_OR(user_id = $2) AS reacted
     FROM forum_reactions WHERE ${column} = $1 GROUP BY emoji ORDER BY emoji`,
    [id, userId || null]
  );
  return rows;
}

function validateTitle(title) {
  const t = (title || '').trim();
  if (!t) return 'Title is required';
  if (t.length > TITLE_MAX) return `Title must be ${TITLE_MAX} characters or fewer`;
  return null;
}
function validateBody(body) {
  const b = (body || '').trim();
  if (!b) return 'Body is required';
  if (b.length > BODY_MAX) return `Body must be ${BODY_MAX} characters or fewer`;
  return null;
}

// --- Channels --------------------------------------------------------------

router.get('/channels', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT c.id, c.name, c.description, c.sort_order,
           (SELECT COUNT(*)::int FROM forum_threads t WHERE t.channel_id = c.id) AS thread_count
    FROM forum_channels c ORDER BY c.sort_order
  `);
  res.json({ channels: rows });
});

// --- Threads -----------------------------------------------------------------

router.get('/channels/:channelId/threads', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.id, t.title, t.pinned, t.created_at, t.edited_at,
            u.id AS author_id, u.display_name AS author_name,
            (SELECT COUNT(*)::int FROM forum_replies r WHERE r.thread_id = t.id) AS reply_count,
            GREATEST(t.updated_at, COALESCE((SELECT MAX(r.created_at) FROM forum_replies r WHERE r.thread_id = t.id), t.updated_at)) AS last_activity
     FROM forum_threads t
     JOIN users u ON u.id = t.user_id
     WHERE t.channel_id = $1
     ORDER BY t.pinned DESC, last_activity DESC`,
    [req.params.channelId]
  );
  res.json({
    threads: rows.map(r => ({
      id: r.id, title: r.title, pinned: r.pinned, createdAt: r.created_at, editedAt: r.edited_at,
      author: { id: r.author_id, displayName: r.author_name },
      replyCount: r.reply_count, lastActivity: r.last_activity,
    })),
  });
});

router.get('/threads/:id', optionalAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.*, u.display_name AS author_name
     FROM forum_threads t JOIN users u ON u.id = t.user_id WHERE t.id = $1`,
    [req.params.id]
  );
  const t = rows[0];
  if (!t) return res.status(404).json({ error: 'Thread not found' });

  const { rows: replyRows } = await pool.query(
    `SELECT r.*, u.display_name AS author_name
     FROM forum_replies r JOIN users u ON u.id = r.user_id
     WHERE r.thread_id = $1 ORDER BY r.created_at ASC`,
    [req.params.id]
  );

  const threadReactions = await reactionsFor('thread_id', t.id, req.userId);
  const replies = [];
  for (const r of replyRows) {
    replies.push({
      id: r.id, body: r.body, createdAt: r.created_at, editedAt: r.edited_at,
      author: { id: r.user_id, displayName: r.author_name },
      reactions: await reactionsFor('reply_id', r.id, req.userId),
    });
  }

  res.json({
    thread: {
      id: t.id, channelId: t.channel_id, title: t.title, body: t.body, pinned: t.pinned,
      createdAt: t.created_at, editedAt: t.edited_at,
      author: { id: t.user_id, displayName: t.author_name },
      reactions: threadReactions,
    },
    replies,
    viewerIsAdmin: await isAdmin(req.userId),
  });
});

router.post('/channels/:channelId/threads', requireAuth, async (req, res) => {
  const { title, body } = req.body || {};
  const titleErr = validateTitle(title);
  const bodyErr = validateBody(body);
  if (titleErr || bodyErr) return res.status(400).json({ error: titleErr || bodyErr });

  const channel = await pool.query(`SELECT id FROM forum_channels WHERE id = $1`, [req.params.channelId]);
  if (!channel.rows[0]) return res.status(404).json({ error: 'Channel not found' });

  const { rows } = await pool.query(
    `INSERT INTO forum_threads (channel_id, user_id, title, body) VALUES ($1, $2, $3, $4)
     RETURNING id, created_at`,
    [req.params.channelId, req.userId, title.trim(), body.trim()]
  );
  res.status(201).json({ thread: { id: rows[0].id, createdAt: rows[0].created_at } });
});

router.put('/threads/:id', requireAuth, async (req, res) => {
  const { title, body } = req.body || {};
  const titleErr = title !== undefined ? validateTitle(title) : null;
  const bodyErr = body !== undefined ? validateBody(body) : null;
  if (titleErr || bodyErr) return res.status(400).json({ error: titleErr || bodyErr });

  const { rows } = await pool.query(
    `UPDATE forum_threads SET title = COALESCE($1, title), body = COALESCE($2, body),
       updated_at = now(), edited_at = now()
     WHERE id = $3 AND user_id = $4
     RETURNING id`,
    [title?.trim() || null, body?.trim() || null, req.params.id, req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Thread not found, or not yours to edit' });
  res.json({ ok: true });
});

router.delete('/threads/:id', requireAuth, async (req, res) => {
  const admin = await isAdmin(req.userId);
  const { rowCount } = await pool.query(
    admin
      ? `DELETE FROM forum_threads WHERE id = $1`
      : `DELETE FROM forum_threads WHERE id = $1 AND user_id = $2`,
    admin ? [req.params.id] : [req.params.id, req.userId]
  );
  if (!rowCount) return res.status(404).json({ error: 'Thread not found, or not yours to delete' });
  res.status(204).end();
});

router.post('/threads/:id/pin', requireAuth, async (req, res) => {
  if (!(await isAdmin(req.userId))) return res.status(403).json({ error: 'Admin only' });
  const { rows } = await pool.query(
    `UPDATE forum_threads SET pinned = NOT pinned WHERE id = $1 RETURNING pinned`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Thread not found' });
  res.json({ pinned: rows[0].pinned });
});

// --- Replies -----------------------------------------------------------------

router.post('/threads/:id/replies', requireAuth, async (req, res) => {
  const { body } = req.body || {};
  const bodyErr = validateBody(body);
  if (bodyErr) return res.status(400).json({ error: bodyErr });

  const thread = await pool.query(`SELECT id FROM forum_threads WHERE id = $1`, [req.params.id]);
  if (!thread.rows[0]) return res.status(404).json({ error: 'Thread not found' });

  const { rows } = await pool.query(
    `INSERT INTO forum_replies (thread_id, user_id, body) VALUES ($1, $2, $3) RETURNING id, created_at`,
    [req.params.id, req.userId, body.trim()]
  );
  res.status(201).json({ reply: { id: rows[0].id, createdAt: rows[0].created_at } });
});

router.put('/replies/:id', requireAuth, async (req, res) => {
  const { body } = req.body || {};
  const bodyErr = validateBody(body);
  if (bodyErr) return res.status(400).json({ error: bodyErr });

  const { rows } = await pool.query(
    `UPDATE forum_replies SET body = $1, edited_at = now() WHERE id = $2 AND user_id = $3 RETURNING id`,
    [body.trim(), req.params.id, req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Reply not found, or not yours to edit' });
  res.json({ ok: true });
});

router.delete('/replies/:id', requireAuth, async (req, res) => {
  const admin = await isAdmin(req.userId);
  const { rowCount } = await pool.query(
    admin
      ? `DELETE FROM forum_replies WHERE id = $1`
      : `DELETE FROM forum_replies WHERE id = $1 AND user_id = $2`,
    admin ? [req.params.id] : [req.params.id, req.userId]
  );
  if (!rowCount) return res.status(404).json({ error: 'Reply not found, or not yours to delete' });
  res.status(204).end();
});

// --- Reactions -----------------------------------------------------------------
// Toggle semantics: posting the same emoji twice removes it. One user can
// have multiple different emoji on the same post at once (Discord-like),
// just not the same emoji twice (enforced by the partial unique indexes in
// schema.sql, not just this check-then-act — a concurrent double-click
// racing this read would hit that constraint and 500 rather than duplicate,
// an acceptable rare edge case for a reaction button).

async function toggleReaction(column, targetTable, targetId, userId, emoji, res) {
  if (!ALLOWED_EMOJI.includes(emoji)) return res.status(400).json({ error: 'Unsupported emoji' });
  const target = await pool.query(`SELECT id FROM ${targetTable} WHERE id = $1`, [targetId]);
  if (!target.rows[0]) return res.status(404).json({ error: 'Not found' });

  const existing = await pool.query(
    `SELECT id FROM forum_reactions WHERE user_id = $1 AND ${column} = $2 AND emoji = $3`,
    [userId, targetId, emoji]
  );
  if (existing.rows[0]) {
    await pool.query(`DELETE FROM forum_reactions WHERE id = $1`, [existing.rows[0].id]);
  } else {
    await pool.query(
      `INSERT INTO forum_reactions (user_id, ${column}, emoji) VALUES ($1, $2, $3)`,
      [userId, targetId, emoji]
    );
  }
  res.json({ reactions: await reactionsFor(column, targetId, userId) });
}

router.post('/threads/:id/reactions', requireAuth, (req, res) =>
  toggleReaction('thread_id', 'forum_threads', req.params.id, req.userId, (req.body || {}).emoji, res)
);
router.post('/replies/:id/reactions', requireAuth, (req, res) =>
  toggleReaction('reply_id', 'forum_replies', req.params.id, req.userId, (req.body || {}).emoji, res)
);

// --- Members (for @mention autocomplete) --------------------------------------

router.get('/members', async (req, res) => {
  const { rows } = await pool.query(`SELECT id, display_name FROM users ORDER BY display_name`);
  res.json({ members: rows.map(r => ({ id: r.id, displayName: r.display_name })) });
});

export default router;
