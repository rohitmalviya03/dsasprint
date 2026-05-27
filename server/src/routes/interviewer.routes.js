import express from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth, requireInterviewer } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = express.Router();

const profileSchema = z.object({
  headline: z.string().trim().max(150).nullable().optional(),
  company: z.string().trim().max(120).nullable().optional(),
  experience_years: z.number().int().min(0).max(70),
  expertise: z.string().trim().min(2).max(500),
  linkedin_url: z.string().url().max(1000).nullable().optional().or(z.literal('')),
  bio: z.string().trim().max(2000).nullable().optional()
});

const availabilitySchema = z.object({
  available_from: z.string().trim().min(1),
  available_to: z.string().trim().min(1),
  notes: z.string().trim().max(200).nullable().optional()
});

const feedbackSchema = z.object({
  problem_solving_score: z.number().int().min(1).max(5),
  communication_score: z.number().int().min(1).max(5),
  coding_quality_score: z.number().int().min(1).max(5),
  fundamentals_score: z.number().int().min(1).max(5),
  strengths: z.string().trim().min(10).max(2000),
  improvement_areas: z.string().trim().min(10).max(2000),
  recommended_practice: z.string().trim().min(5).max(2000),
  recommendation: z.enum(['Needs Practice', 'Interview Ready', 'Strong Candidate'])
});

router.use(requireAuth, requireInterviewer);

router.get('/dashboard', asyncHandler(async (req, res) => {
  const [[profiles], [availability], [interviews]] = await Promise.all([
    pool.execute(
      `SELECT users.name, users.email, interviewer_profiles.headline, interviewer_profiles.company,
         interviewer_profiles.experience_years, interviewer_profiles.expertise,
         interviewer_profiles.linkedin_url, interviewer_profiles.bio
       FROM interviewer_profiles INNER JOIN users ON users.id = interviewer_profiles.user_id
       WHERE interviewer_profiles.user_id = ? LIMIT 1`,
      [req.user.id]
    ),
    pool.execute(
      `SELECT id, available_from, available_to, status, notes
       FROM interviewer_availability
       WHERE interviewer_id = ? AND available_to >= CURRENT_TIMESTAMP
       ORDER BY available_from ASC`,
      [req.user.id]
    ),
    pool.execute(
      `SELECT mock_interviews.id, mock_interviews.interview_track, mock_interviews.focus_area,
         mock_interviews.interview_type, mock_interviews.scheduled_at, mock_interviews.duration_minutes,
         mock_interviews.notes, mock_interviews.status, mock_interviews.assignment_status,
         mock_interviews.meeting_link, users.name AS candidate_name, users.email AS candidate_email,
         interview_feedback.problem_solving_score, interview_feedback.communication_score,
         interview_feedback.coding_quality_score, interview_feedback.fundamentals_score,
         interview_feedback.strengths, interview_feedback.improvement_areas,
         interview_feedback.recommended_practice, interview_feedback.recommendation
       FROM mock_interviews
       INNER JOIN users ON users.id = mock_interviews.user_id
       LEFT JOIN interview_feedback ON interview_feedback.interview_id = mock_interviews.id
       WHERE mock_interviews.interviewer_id = ?
       ORDER BY mock_interviews.scheduled_at DESC`,
      [req.user.id]
    )
  ]);
  res.json({ profile: profiles[0], availability, interviews });
}));

router.put('/profile', asyncHandler(async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Complete your profile with valid expertise and links.' });
  const profile = parsed.data;
  await pool.execute(
    `UPDATE interviewer_profiles
     SET headline = ?, company = ?, experience_years = ?, expertise = ?, linkedin_url = ?, bio = ?
     WHERE user_id = ?`,
    [profile.headline || null, profile.company || null, profile.experience_years, profile.expertise,
      profile.linkedin_url || null, profile.bio || null, req.user.id]
  );
  res.json({ message: 'Interviewer profile updated.' });
}));

router.post('/availability', asyncHandler(async (req, res) => {
  const parsed = availabilitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Provide a valid availability period.' });
  const availableFrom = new Date(parsed.data.available_from);
  const availableTo = new Date(parsed.data.available_to);
  if (Number.isNaN(availableFrom.getTime()) || Number.isNaN(availableTo.getTime()) || availableFrom <= new Date() || availableTo <= availableFrom) {
    return res.status(400).json({ message: 'Availability must be a future time range with an end after its start.' });
  }
  const [overlaps] = await pool.execute(
    `SELECT id FROM interviewer_availability
     WHERE interviewer_id = ? AND status = 'Available'
       AND available_from < ? AND available_to > ?
     LIMIT 1`,
    [req.user.id, availableTo, availableFrom]
  );
  if (overlaps.length) return res.status(409).json({ message: 'This time overlaps an existing available slot.' });
  await pool.execute(
    'INSERT INTO interviewer_availability (interviewer_id, available_from, available_to, notes) VALUES (?, ?, ?, ?)',
    [req.user.id, availableFrom, availableTo, parsed.data.notes || null]
  );
  res.status(201).json({ message: 'Availability slot added.' });
}));

router.delete('/availability/:id', asyncHandler(async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ message: 'Invalid availability slot.' });
  const [result] = await pool.execute(
    `DELETE FROM interviewer_availability
     WHERE id = ? AND interviewer_id = ? AND status = 'Available' AND available_from > CURRENT_TIMESTAMP`,
    [id.data, req.user.id]
  );
  if (!result.affectedRows) return res.status(404).json({ message: 'Available future slot not found.' });
  res.json({ message: 'Availability slot removed.' });
}));

router.patch('/interviews/:id/respond', asyncHandler(async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const parsed = z.object({ response: z.enum(['Accepted', 'Declined']) }).safeParse(req.body);
  if (!id.success || !parsed.success) return res.status(400).json({ message: 'Provide a valid response.' });
  if (parsed.data.response === 'Accepted') {
    const [pending] = await pool.execute(
      `SELECT meeting_link FROM mock_interviews
       WHERE id = ? AND interviewer_id = ? AND assignment_status = 'Pending'
       LIMIT 1`,
      [id.data, req.user.id]
    );
    if (!pending.length) return res.status(404).json({ message: 'Pending interview assignment not found.' });
    if (!pending[0].meeting_link) return res.status(409).json({ message: 'A Google Meet link is required before this assignment can be accepted.' });
    const [result] = await pool.execute(
      `UPDATE mock_interviews SET assignment_status = 'Accepted', status = 'Scheduled'
       WHERE id = ? AND interviewer_id = ? AND assignment_status = 'Pending'`,
      [id.data, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Pending interview assignment not found.' });
    return res.json({ message: 'Interview accepted.' });
  }
  const [result] = await pool.execute(
    `UPDATE mock_interviews SET assignment_status = 'Declined', status = 'Requested',
       interviewer_id = NULL, assigned_to = NULL, interviewer_email = NULL, meeting_link = NULL
     WHERE id = ? AND interviewer_id = ? AND assignment_status = 'Pending'`,
    [id.data, req.user.id]
  );
  if (!result.affectedRows) return res.status(404).json({ message: 'Pending interview assignment not found.' });
  return res.json({ message: 'Assignment declined and returned to the admin queue.' });
}));

router.put('/interviews/:id/feedback', asyncHandler(async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const parsed = feedbackSchema.safeParse(req.body);
  if (!id.success || !parsed.success) return res.status(400).json({ message: 'Complete every score and feedback field.' });
  const [interviews] = await pool.execute(
    `SELECT id FROM mock_interviews
     WHERE id = ? AND interviewer_id = ? AND assignment_status = 'Accepted' AND status <> 'Cancelled'
     LIMIT 1`,
    [id.data, req.user.id]
  );
  if (!interviews.length) return res.status(404).json({ message: 'Accepted interview assignment not found.' });
  const value = parsed.data;
  await pool.execute(
    `INSERT INTO interview_feedback
      (interview_id, interviewer_id, problem_solving_score, communication_score, coding_quality_score,
       fundamentals_score, strengths, improvement_areas, recommended_practice, recommendation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE problem_solving_score = VALUES(problem_solving_score),
       communication_score = VALUES(communication_score), coding_quality_score = VALUES(coding_quality_score),
       fundamentals_score = VALUES(fundamentals_score), strengths = VALUES(strengths),
       improvement_areas = VALUES(improvement_areas), recommended_practice = VALUES(recommended_practice),
       recommendation = VALUES(recommendation), interviewer_id = VALUES(interviewer_id)`,
    [id.data, req.user.id, value.problem_solving_score, value.communication_score, value.coding_quality_score,
      value.fundamentals_score, value.strengths, value.improvement_areas, value.recommended_practice, value.recommendation]
  );
  await pool.execute("UPDATE mock_interviews SET status = 'Completed' WHERE id = ?", [id.data]);
  res.json({ message: 'Interview feedback submitted and shared with the learner.' });
}));

export default router;
