import express from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = express.Router();
const durationOptions = [30, 45, 60, 90];
const requestSchema = z.object({
  interview_track: z.enum(['DSA', 'Development']),
  focus_area: z.string().trim().min(2).max(80),
  interview_type: z.enum(['Technical', 'Behavioral', 'Mixed']),
  scheduled_at: z.string().trim().min(1),
  duration_minutes: z.number().int().refine((duration) => durationOptions.includes(duration)),
  notes: z.string().trim().max(500).nullable().optional()
});

router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const [interviews] = await pool.execute(
    `SELECT mock_interviews.id, mock_interviews.interview_track, mock_interviews.interview_mode,
       mock_interviews.focus_area, mock_interviews.interview_type, mock_interviews.scheduled_at,
       mock_interviews.duration_minutes, mock_interviews.notes, mock_interviews.status,
       mock_interviews.assignment_status, mock_interviews.assigned_to, mock_interviews.meeting_link,
       mock_interviews.admin_notes, mock_interviews.created_at,
       interviewer_profiles.headline AS interviewer_headline,
       interview_feedback.problem_solving_score, interview_feedback.communication_score,
       interview_feedback.coding_quality_score, interview_feedback.fundamentals_score,
       interview_feedback.strengths, interview_feedback.improvement_areas,
       interview_feedback.recommended_practice, interview_feedback.recommendation
     FROM mock_interviews
     LEFT JOIN interviewer_profiles ON interviewer_profiles.user_id = mock_interviews.interviewer_id
     LEFT JOIN interview_feedback ON interview_feedback.interview_id = mock_interviews.id
     WHERE mock_interviews.user_id = ?
     ORDER BY mock_interviews.created_at DESC`,
    [req.user.id]
  );
  res.json({ interviews, aiComingSoon: true });
}));

router.post('/', asyncHandler(async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Provide a valid track, focus area, round type, preferred time, and duration.' });
  const scheduledAt = new Date(parsed.data.scheduled_at);
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
    return res.status(400).json({ message: 'Choose a future preferred date and time.' });
  }
  const slotEndsAt = new Date(scheduledAt.getTime() + parsed.data.duration_minutes * 60 * 1000);
  const [overlaps] = await pool.execute(
    `SELECT id FROM mock_interviews
     WHERE user_id = ? AND status IN ('Requested', 'Scheduled')
       AND scheduled_at < ?
       AND DATE_ADD(scheduled_at, INTERVAL duration_minutes MINUTE) > ?
     LIMIT 1`,
    [req.user.id, slotEndsAt, scheduledAt]
  );
  if (overlaps.length) {
    return res.status(409).json({ message: 'This preferred time overlaps another active interview request.' });
  }
  await pool.execute(
    `INSERT INTO mock_interviews
      (user_id, interview_track, interview_mode, focus_area, interview_type, scheduled_at, duration_minutes, notes, status)
     VALUES (?, ?, 'Person', ?, ?, ?, ?, ?, 'Requested')`,
    [req.user.id, parsed.data.interview_track, parsed.data.focus_area, parsed.data.interview_type, scheduledAt, parsed.data.duration_minutes, parsed.data.notes || null]
  );
  res.status(201).json({ message: 'Mock interview request submitted. You will see the meeting link after assignment.' });
}));

router.patch('/:id/cancel', asyncHandler(async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ message: 'Invalid interview request.' });
  const [result] = await pool.execute(
    `UPDATE mock_interviews SET status = 'Cancelled'
     WHERE id = ? AND user_id = ? AND status IN ('Requested', 'Scheduled')`,
    [id.data, req.user.id]
  );
  if (!result.affectedRows) return res.status(404).json({ message: 'Active interview request not found.' });
  res.json({ message: 'Mock interview request cancelled.' });
}));

export default router;
