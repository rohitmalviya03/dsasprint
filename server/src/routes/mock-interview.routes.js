import express from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = express.Router();
const durationOptions = [30, 45, 60, 90];

const interviewSchema = z.object({
  interview_track: z.enum(['DSA', 'Development']),
  interview_mode: z.enum(['AI', 'Person']),
  focus_area: z.string().trim().min(2).max(80),
  interview_type: z.enum(['Technical', 'Behavioral', 'Mixed']),
  scheduled_at: z.string().trim().min(1),
  duration_minutes: z.number().int().refine((duration) => durationOptions.includes(duration)),
  notes: z.string().trim().max(500).nullable().optional()
});

const idSchema = z.coerce.number().int().positive();

router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  await pool.execute(
    `UPDATE mock_interviews
     SET status = 'Completed'
     WHERE user_id = ?
       AND status = 'Scheduled'
       AND DATE_ADD(scheduled_at, INTERVAL duration_minutes MINUTE) <= CURRENT_TIMESTAMP`,
    [req.user.id]
  );
  const [interviews] = await pool.execute(
    `SELECT id, interview_track, interview_mode, focus_area, interview_type, scheduled_at,
       duration_minutes, notes, status, created_at
     FROM mock_interviews
     WHERE user_id = ?
     ORDER BY scheduled_at ASC`,
    [req.user.id]
  );
  res.json({ interviews });
}));

router.post('/', asyncHandler(async (req, res) => {
  const parsed = interviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Please provide a valid track, interview mode, round type, focus area, time slot, and duration.' });
  }

  const { interview_track, interview_mode, focus_area, interview_type, duration_minutes, notes } = parsed.data;
  const scheduledAt = new Date(parsed.data.scheduled_at);
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
    return res.status(400).json({ message: 'Choose a future date and time for your mock interview.' });
  }

  const slotEndsAt = new Date(scheduledAt.getTime() + (duration_minutes * 60 * 1000));
  const [overlaps] = await pool.execute(
    `SELECT id
     FROM mock_interviews
     WHERE user_id = ?
       AND status = 'Scheduled'
       AND scheduled_at < ?
       AND DATE_ADD(scheduled_at, INTERVAL duration_minutes MINUTE) > ?
     LIMIT 1`,
    [req.user.id, slotEndsAt, scheduledAt]
  );
  if (overlaps.length) {
    return res.status(409).json({ message: 'This slot overlaps another scheduled mock interview.' });
  }

  const [result] = await pool.execute(
    `INSERT INTO mock_interviews
      (user_id, interview_track, interview_mode, focus_area, interview_type, scheduled_at, duration_minutes, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, interview_track, interview_mode, focus_area, interview_type, scheduledAt, duration_minutes, notes || null]
  );

  res.status(201).json({ id: result.insertId, message: 'Mock interview scheduled.' });
}));

router.patch('/:id/cancel', asyncHandler(async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    return res.status(400).json({ message: 'Invalid mock interview.' });
  }

  const [result] = await pool.execute(
    `UPDATE mock_interviews
     SET status = 'Cancelled'
     WHERE id = ? AND user_id = ? AND status = 'Scheduled' AND scheduled_at > CURRENT_TIMESTAMP`,
    [id.data, req.user.id]
  );
  if (!result.affectedRows) {
    return res.status(404).json({ message: 'Scheduled interview not found.' });
  }

  res.json({ message: 'Mock interview cancelled.' });
}));

export default router;
