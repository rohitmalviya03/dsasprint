import express from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = express.Router();
const streams = new Map();
const dueDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

router.use(requireAuth);

function notifyProgressChanged(userId) {
  for (const response of streams.get(userId) || []) {
    response.write(`event: progress\ndata: ${JSON.stringify({ updatedAt: new Date().toISOString() })}\n\n`);
  }
}

router.get('/events', (req, res) => {
  res.set({
    'Cache-Control': 'no-cache',
    'Content-Type': 'text/event-stream',
    Connection: 'keep-alive'
  });
  res.flushHeaders();
  res.write('event: ready\ndata: {}\n\n');

  const clients = streams.get(req.user.id) || new Set();
  clients.add(res);
  streams.set(req.user.id, clients);
  const keepAlive = setInterval(() => res.write(': heartbeat\n\n'), 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    clients.delete(res);
    if (!clients.size) streams.delete(req.user.id);
  });
});

router.get('/', asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT problem_id, status, notes, bookmarked, revision_count, revision_due_on, last_visited_at, updated_at FROM problem_progress WHERE user_id = ?',
    [req.user.id]
  );
  const progress = {};
  for (const row of rows) progress[row.problem_id] = row;
  res.json({ progress });
}));

router.put('/:problemId', asyncHandler(async (req, res) => {
  const schema = z.object({
    status: z.enum(['Not Attempted', 'Learning', 'Revision', 'Solved']).optional(),
    notes: z.string().max(10000).optional().nullable(),
    bookmarked: z.boolean().optional(),
    revision_count: z.number().int().min(0).optional(),
    revision_due_on: dueDateSchema.optional(),
    last_visited: z.boolean().optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid progress payload', errors: parsed.error.flatten() });
  }

  const current = parsed.data;
  const status = current.status ?? 'Not Attempted';
  const notes = current.notes ?? null;
  const bookmarked = current.bookmarked ?? false;
  const revisionCount = current.revision_count ?? 0;
  const revisionDueOn = current.revision_due_on ?? null;
  const touchVisited = current.last_visited ? 'CURRENT_TIMESTAMP' : 'NULL';

  await pool.execute(`
    INSERT INTO problem_progress (user_id, problem_id, status, notes, bookmarked, revision_count, revision_due_on, last_visited_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ${touchVisited})
    ON DUPLICATE KEY UPDATE
      status = IF(?, VALUES(status), status),
      notes = IF(?, VALUES(notes), notes),
      bookmarked = IF(?, VALUES(bookmarked), bookmarked),
      revision_count = IF(?, VALUES(revision_count), revision_count),
      revision_due_on = IF(?, VALUES(revision_due_on), revision_due_on),
      last_visited_at = IF(${current.last_visited ? 'TRUE' : 'FALSE'}, CURRENT_TIMESTAMP, last_visited_at)
  `, [
    req.user.id,
    req.params.problemId,
    status,
    notes,
    bookmarked,
    revisionCount,
    revisionDueOn,
    current.status !== undefined,
    current.notes !== undefined,
    current.bookmarked !== undefined,
    current.revision_count !== undefined,
    current.revision_due_on !== undefined
  ]);
  notifyProgressChanged(req.user.id);
  res.json({ message: 'Progress saved' });
}));

router.post('/bulk-import', asyncHandler(async (req, res) => {
  const schema = z.object({
    progress: z.record(z.object({
      status: z.enum(['Not Attempted', 'Learning', 'Revision', 'Solved']).optional(),
      notes: z.string().max(10000).optional().nullable(),
      bookmarked: z.boolean().optional(),
      revision_count: z.number().int().min(0).optional(),
      revision_due_on: dueDateSchema.optional()
    }))
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid import JSON' });

  const entries = Object.entries(parsed.data.progress);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const [problemId, value] of entries) {
      const status = value.status || 'Not Attempted';
      await connection.execute(`
        INSERT INTO problem_progress (user_id, problem_id, status, notes, bookmarked, revision_count, revision_due_on)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          notes = VALUES(notes),
          bookmarked = VALUES(bookmarked),
          revision_count = VALUES(revision_count),
          revision_due_on = VALUES(revision_due_on)
      `, [
        req.user.id,
        problemId,
        status,
        value.notes ?? null,
        value.bookmarked ?? false,
        value.revision_count ?? 0,
        value.revision_due_on ?? null
      ]);
    }
    await connection.commit();
    notifyProgressChanged(req.user.id);
    res.json({ message: 'Import completed', count: entries.length });
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}));

router.delete('/reset', asyncHandler(async (req, res) => {
  await pool.execute('DELETE FROM problem_progress WHERE user_id = ?', [req.user.id]);
  notifyProgressChanged(req.user.id);
  res.json({ message: 'Stats reset' });
}));

export default router;
