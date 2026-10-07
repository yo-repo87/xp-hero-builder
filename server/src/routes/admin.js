import { Router } from 'express';
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

export default router;
