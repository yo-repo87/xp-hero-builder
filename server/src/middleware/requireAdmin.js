import pool from '../db.js';

// Must run AFTER requireAuth (needs req.userId already set). Checks
// is_admin live against the database on every request rather than baking
// it into the JWT, so revoking admin takes effect immediately without
// forcing a re-login — same reasoning the Forum's own isAdmin() check uses.
export default async function requireAdmin(req, res, next) {
  const { rows } = await pool.query(`SELECT is_admin FROM users WHERE id = $1`, [req.userId]);
  if (!rows[0]?.is_admin) return res.status(403).json({ error: 'Admin only' });
  next();
}
