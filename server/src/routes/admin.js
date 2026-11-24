import express, { Router } from 'express';
import pool from '../db.js';
import requireAuth from '../middleware/requireAuth.js';
import requireAdmin from '../middleware/requireAdmin.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// "Online" here is a deliberate approximation, not real live presence —
// this app has no WebSocket/heartbeat layer. A refresh token is reissued
// (rotated) every time the frontend's access token expires and gets
// silently renewed (every ~15 min of real use, see tokens.js's
// ACCESS_TOKEN_TTL), so "their newest non-revoked refresh token was
// created in the last 15 minutes" is a reasonable proxy for "has an open
// tab actively using the app right now" — much tighter than "has *any*
// unexpired token," which would stay true for the full 30-day refresh
// lifetime and call almost everyone who ever signed in "online."
const ONLINE_WINDOW_MINUTES = 15;

router.get('/analytics', async (req, res) => {
  const [{ rows: totals }, { rows: signupsByDay }, { rows: forumTotals }, { rows: saveTotals }] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total_users, COUNT(*) FILTER (WHERE is_admin)::int AS total_admins FROM users`),
    pool.query(
      `SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS count
       FROM users WHERE created_at > now() - interval '30 days'
       GROUP BY day ORDER BY day`
    ),
    pool.query(`SELECT (SELECT COUNT(*) FROM forum_threads)::int AS threads, (SELECT COUNT(*) FROM forum_replies)::int AS replies`),
    pool.query(`SELECT COUNT(*)::int AS total_saves FROM saves`),
  ]);
  const { rows: onlineRows } = await pool.query(
    `SELECT COUNT(DISTINCT user_id)::int AS online
     FROM refresh_tokens
     WHERE revoked_at IS NULL AND created_at > now() - interval '${ONLINE_WINDOW_MINUTES} minutes'`
  );
  res.json({
    totalUsers: totals[0].total_users,
    totalAdmins: totals[0].total_admins,
    onlineNow: onlineRows[0].online,
    newSignups7d: signupsByDay.filter(r => r.day >= new Date(Date.now() - 7 * 86400000)).reduce((s, r) => s + r.count, 0),
    newSignups30d: signupsByDay.reduce((s, r) => s + r.count, 0),
    signupsByDay: signupsByDay.map(r => ({ day: r.day, count: r.count })),
    forumThreads: forumTotals[0].threads,
    forumReplies: forumTotals[0].replies,
    totalSaves: saveTotals[0].total_saves,
  });
});

router.get('/users', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.id, u.email, u.display_name, u.is_admin, u.email_verified, u.created_at,
           (SELECT MAX(rt.created_at) FROM refresh_tokens rt WHERE rt.user_id = u.id AND rt.revoked_at IS NULL) AS last_active_at,
           EXISTS(
             SELECT 1 FROM refresh_tokens rt
             WHERE rt.user_id = u.id AND rt.revoked_at IS NULL
               AND rt.created_at > now() - interval '${ONLINE_WINDOW_MINUTES} minutes'
           ) AS online,
           (SELECT COUNT(*)::int FROM saves s WHERE s.user_id = u.id) AS save_count
    FROM users u
    ORDER BY online DESC, u.created_at DESC
  `);
  res.json({
    users: rows.map(r => ({
      id: r.id, email: r.email, displayName: r.display_name, isAdmin: r.is_admin,
      emailVerified: r.email_verified, createdAt: r.created_at, lastActiveAt: r.last_active_at,
      online: r.online, saveCount: r.save_count,
    })),
  });
});

router.post('/users/:id/promote', async (req, res) => {
  const { rows } = await pool.query(`UPDATE users SET is_admin = true WHERE id = $1 RETURNING id`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json({ ok: true });
});

router.post('/users/:id/demote', async (req, res) => {
  if (req.params.id === req.userId) {
    return res.status(400).json({ error: "You can't remove your own admin access" });
  }
  const { rows: adminCount } = await pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE is_admin`);
  const { rows: target } = await pool.query(`SELECT is_admin FROM users WHERE id = $1`, [req.params.id]);
  if (!target[0]) return res.status(404).json({ error: 'User not found' });
  if (target[0].is_admin && adminCount[0].n <= 1) {
    return res.status(400).json({ error: 'At least one admin must remain' });
  }
  await pool.query(`UPDATE users SET is_admin = false WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

router.delete('/users/:id', async (req, res) => {
  if (req.params.id === req.userId) {
    return res.status(400).json({ error: "You can't delete your own account from here" });
  }
  const { rowCount } = await pool.query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'User not found' });
  res.status(204).end();
});

// Game save backup: asks the internal savepull helper (server/savepull) to
// pull the game's save files off the Android VM and streams back the zip.
// The helper is only reachable on the Docker bridge and needs a shared token.
router.get('/game-saves', async (req, res) => {
  const url = process.env.SAVEPULL_URL, token = process.env.SAVEPULL_TOKEN;
  if (!url || !token) return res.status(503).json({ error: 'Game save backup is not configured on this server' });
  try {
    const r = await fetch(`${url}/saves.zip`, { headers: { 'x-savepull-token': token }, signal: AbortSignal.timeout(90000) });
    if (r.status === 429) return res.status(429).json({ error: 'A save pull is already running, try again in a moment' });
    if (!r.ok) return res.status(502).json({ error: 'Could not pull saves from the game VM (is it running?)' });
    const buf = Buffer.from(await r.arrayBuffer());
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="xphero-saves-${stamp}.zip"`, 'Cache-Control': 'no-store' });
    res.send(buf);
  } catch {
    res.status(502).json({ error: 'The save pull helper did not respond' });
  }
});

// Apply a save zip to the VM. The helper writes only save_* files and refuses
// while the game process is still running.
router.post('/game-saves', express.raw({ type: () => true, limit: '8mb' }), async (req, res) => {
  const url = process.env.SAVEPULL_URL, token = process.env.SAVEPULL_TOKEN;
  if (!url || !token) return res.status(503).json({ error: 'Game save backup is not configured on this server' });
  if (!Buffer.isBuffer(req.body) || req.body.length < 22) return res.status(400).json({ error: 'Upload a zip of save files' });
  try {
    const r = await fetch(`${url}/saves.zip`, {
      method: 'POST',
      headers: { 'x-savepull-token': token, 'content-type': 'application/zip' },
      body: req.body,
      signal: AbortSignal.timeout(120000),
    });
    const text = await r.text();
    let payload = {};
    try { payload = JSON.parse(text); } catch { /* helper sent a plain-text error */ }
    if (r.status === 429) return res.status(429).json({ error: payload.error || 'A save transfer is already running, try again in a moment' });
    if (!r.ok) return res.status(r.status === 400 || r.status === 409 || r.status === 413 ? r.status : 502).json({ error: payload.error || 'Could not apply the save to the game VM' });
    res.json({ ok: true, count: payload.count || 0 });
  } catch {
    res.status(502).json({ error: 'The save pull helper did not respond' });
  }
});

export default router;
