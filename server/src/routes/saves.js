import { Router } from 'express';
import pool from '../db.js';
import requireAuth from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

// List (no `data` payload — keeps this cheap for a "pick a save" screen).
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, created_at, updated_at FROM saves WHERE user_id = $1 ORDER BY updated_at DESC`,
    [req.userId]
  );
  res.json({ saves: rows });
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM saves WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
  if (!rows[0]) return res.status(404).json({ error: 'Save not found' });
  res.json({ save: rows[0] });
});

// Body: { name?, data } — `data` is the app's existing Export/Import JSON
// blob, stored as-is, no schema translation.
router.post('/', async (req, res) => {
  const { name, data } = req.body || {};
  if (data === undefined) return res.status(400).json({ error: 'data is required' });
  const { rows } = await pool.query(
    `INSERT INTO saves (user_id, name, data) VALUES ($1, $2, $3) RETURNING id, name, created_at, updated_at`,
    [req.userId, name || 'My Build', JSON.stringify(data)]
  );
  res.status(201).json({ save: rows[0] });
});

router.put('/:id', async (req, res) => {
  const { name, data } = req.body || {};
  const { rows } = await pool.query(
    `UPDATE saves SET name = COALESCE($1, name), data = COALESCE($2, data), updated_at = now()
     WHERE id = $3 AND user_id = $4
     RETURNING id, name, created_at, updated_at`,
    [name || null, data !== undefined ? JSON.stringify(data) : null, req.params.id, req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Save not found' });
  res.json({ save: rows[0] });
});

router.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query(`DELETE FROM saves WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
  if (!rowCount) return res.status(404).json({ error: 'Save not found' });
  res.status(204).end();
});

export default router;
