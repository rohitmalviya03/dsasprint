import express from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = express.Router();

router.use(requireAuth, requireAdmin);

const problemSchema = z.object({
  category: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(180),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
  rating: z.string().trim().min(1).max(50),
  companies: z.string().trim().min(2).max(500),
  article: z.string().url().max(1000),
  video: z.string().url().max(1000),
  status: z.enum(['Not Attempted', 'Learning', 'Revision', 'Solved']).default('Not Attempted')
});

const planSchema = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(10).max(1000),
  duration_days: z.number().int().min(1).max(365),
  items: z.array(z.object({
    problem_id: z.string().trim().min(1).max(120),
    day_number: z.number().int().min(1).max(365)
  })).min(1).max(1000)
});

const requestUpdateSchema = z.object({
  status: z.enum(['Requested', 'Scheduled', 'Completed', 'Cancelled']),
  interviewer_id: z.string().uuid().nullable().optional().or(z.literal('')),
  meeting_link: z.string().url().max(1000).refine((value) => new URL(value).hostname === 'meet.google.com', 'Use a Google Meet URL').nullable().optional().or(z.literal('')),
  admin_notes: z.string().trim().max(1000).nullable().optional()
});

router.get('/overview', asyncHandler(async (_req, res) => {
  const [[users], [interviewers], [pendingInterviewers], [problems], [plans], [requests]] = await Promise.all([
    pool.execute('SELECT COUNT(*) AS count FROM users'),
    pool.execute('SELECT COUNT(*) AS count FROM interviewer_profiles WHERE is_active = TRUE'),
    pool.execute('SELECT COUNT(*) AS count FROM interviewer_profiles WHERE is_active = FALSE AND approved_at IS NULL'),
    pool.execute('SELECT COUNT(*) AS count FROM admin_problems WHERE is_published = TRUE'),
    pool.execute('SELECT COUNT(*) AS count FROM study_plans WHERE is_published = TRUE'),
    pool.execute("SELECT COUNT(*) AS count FROM mock_interviews WHERE status IN ('Requested', 'Scheduled')")
  ]);
  res.json({
    users: Number(users[0].count),
    interviewers: Number(interviewers[0].count),
    pending_interviewers: Number(pendingInterviewers[0].count),
    added_problems: Number(problems[0].count),
    study_plans: Number(plans[0].count),
    open_interviews: Number(requests[0].count)
  });
}));

router.get('/users', asyncHandler(async (_req, res) => {
  const [users] = await pool.execute(
    `SELECT users.id, users.name, users.email, users.contact_number, users.provider, users.account_role, users.created_at,
       COUNT(problem_progress.id) AS tracked_problems,
       SUM(problem_progress.status = 'Solved') AS solved_problems
     FROM users
     LEFT JOIN problem_progress ON problem_progress.user_id = users.id
     GROUP BY users.id
     ORDER BY users.created_at DESC
     LIMIT 500`
  );
  res.json({ users });
}));

router.get('/interviewers', asyncHandler(async (_req, res) => {
  const [interviewers] = await pool.execute(
    `SELECT users.id, users.name, users.email, interviewer_profiles.headline,
       interviewer_profiles.company, interviewer_profiles.experience_years,
       interviewer_profiles.expertise, interviewer_profiles.linkedin_url,
       interviewer_profiles.bio, interviewer_profiles.is_active, interviewer_profiles.approved_at,
       (SELECT COUNT(*) FROM mock_interviews
        WHERE mock_interviews.interviewer_id = users.id
          AND mock_interviews.status IN ('Requested', 'Scheduled')) AS active_assignments,
       (SELECT COUNT(*) FROM interviewer_availability
        WHERE interviewer_availability.interviewer_id = users.id
          AND interviewer_availability.status = 'Available'
          AND interviewer_availability.available_to >= CURRENT_TIMESTAMP) AS available_slots,
       (SELECT MIN(interviewer_availability.available_from) FROM interviewer_availability
        WHERE interviewer_availability.interviewer_id = users.id
          AND interviewer_availability.status = 'Available'
          AND interviewer_availability.available_to >= CURRENT_TIMESTAMP) AS next_available_at
     FROM interviewer_profiles
     INNER JOIN users ON users.id = interviewer_profiles.user_id
     ORDER BY interviewer_profiles.is_active DESC, users.name ASC`
  );
  res.json({ interviewers });
}));

router.patch('/interviewers/:id/status', asyncHandler(async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const parsed = z.object({ is_active: z.boolean() }).safeParse(req.body);
  if (!id.success || !parsed.success) return res.status(400).json({ message: 'Provide a valid interviewer status.' });
  const [result] = await pool.execute(
    `UPDATE interviewer_profiles
     SET is_active = ?, approved_by = IF(?, ?, approved_by),
       approved_at = IF(?, CURRENT_TIMESTAMP, approved_at)
     WHERE user_id = ?`,
    [parsed.data.is_active, parsed.data.is_active, req.user.id, parsed.data.is_active, id.data]
  );
  if (!result.affectedRows) return res.status(404).json({ message: 'Interviewer not found.' });
  res.json({ message: parsed.data.is_active ? 'Interviewer approved and activated.' : 'Interviewer suspended.' });
}));

router.get('/problems', asyncHandler(async (_req, res) => {
  const [problems] = await pool.execute(
    `SELECT problem_key AS id, category, name, difficulty, rating, companies, article, video,
       initial_status AS status, is_published, created_at
     FROM admin_problems
     ORDER BY created_at DESC`
  );
  res.json({ problems });
}));

router.post('/problems', asyncHandler(async (req, res) => {
  const parsed = problemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Complete all required problem fields with valid article and video links.' });
  const problemKey = `custom-${randomUUID()}`;
  const problem = parsed.data;
  await pool.execute(
    `INSERT INTO admin_problems
      (problem_key, category, name, difficulty, rating, companies, article, video, initial_status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [problemKey, problem.category, problem.name, problem.difficulty, problem.rating, problem.companies, problem.article, problem.video, problem.status, req.user.id]
  );
  res.status(201).json({ id: problemKey, message: 'Problem published.' });
}));

router.get('/study-plans', asyncHandler(async (_req, res) => {
  const [plans] = await pool.execute(
    `SELECT id, title, description, duration_days, is_published, created_at
     FROM study_plans
     ORDER BY created_at DESC`
  );
  res.json({ plans });
}));

router.post('/study-plans', asyncHandler(async (req, res) => {
  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Add a title, description, duration, and at least one valid plan item.' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      'INSERT INTO study_plans (title, description, duration_days, created_by) VALUES (?, ?, ?, ?)',
      [parsed.data.title, parsed.data.description, parsed.data.duration_days, req.user.id]
    );
    for (const [index, item] of parsed.data.items.entries()) {
      await connection.execute(
        'INSERT INTO study_plan_items (study_plan_id, problem_id, day_number, item_order) VALUES (?, ?, ?, ?)',
        [result.insertId, item.problem_id, item.day_number, index + 1]
      );
    }
    await connection.commit();
    res.status(201).json({ id: result.insertId, message: 'Study plan published.' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

router.get('/mock-interviews', asyncHandler(async (_req, res) => {
  const [requests] = await pool.execute(
    `SELECT mock_interviews.id, mock_interviews.interview_track, mock_interviews.interview_mode,
       mock_interviews.focus_area, mock_interviews.interview_type, mock_interviews.scheduled_at,
       mock_interviews.duration_minutes, mock_interviews.notes, mock_interviews.status,
       mock_interviews.interviewer_id, mock_interviews.availability_id, mock_interviews.assignment_status, mock_interviews.assigned_to,
       mock_interviews.interviewer_email, mock_interviews.meeting_link,
       mock_interviews.admin_notes, users.name AS user_name, users.email AS user_email
     FROM mock_interviews
     INNER JOIN users ON users.id = mock_interviews.user_id
     ORDER BY mock_interviews.created_at DESC`
  );
  res.json({ requests });
}));

router.patch('/mock-interviews/:id', asyncHandler(async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const parsed = requestUpdateSchema.safeParse(req.body);
  if (!id.success || !parsed.success) return res.status(400).json({ message: 'Provide a valid assignment, status, and Google Meet link.' });
  const value = parsed.data;
  const interviewerId = value.interviewer_id || null;
  let interviewer = null;
  if (interviewerId) {
    const [profiles] = await pool.execute(
      `SELECT users.id, users.name, users.email
       FROM users INNER JOIN interviewer_profiles ON interviewer_profiles.user_id = users.id
       WHERE users.id = ? AND users.account_role = 'interviewer' AND interviewer_profiles.is_active = TRUE
       LIMIT 1`,
      [interviewerId]
    );
    interviewer = profiles[0];
    if (!interviewer) return res.status(400).json({ message: 'Choose an active registered interviewer.' });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [currentRows] = await connection.execute(
      `SELECT interviewer_id, availability_id, assignment_status, status, scheduled_at, duration_minutes
       FROM mock_interviews WHERE id = ? LIMIT 1 FOR UPDATE`,
      [id.data]
    );
    if (!currentRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Interview request not found.' });
    }
    const current = currentRows[0];
    const assignmentStatus = !interviewer
      ? null
      : current.interviewer_id === interviewer.id
        ? current.assignment_status === 'Accepted' ? 'Accepted' : 'Pending'
        : 'Pending';
    let availabilityId = current.availability_id || null;
    const isNewSchedule = value.status === 'Scheduled'
      && (current.status !== 'Scheduled' || current.interviewer_id !== interviewerId || !availabilityId);
    if (value.status === 'Scheduled' && (!interviewer || !value.meeting_link)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Choose an active interviewer and add a Google Meet link before scheduling.' });
    }
    if (isNewSchedule) {
      const sessionStart = new Date(current.scheduled_at);
      const sessionEnd = new Date(sessionStart.getTime() + Number(current.duration_minutes) * 60 * 1000);
      const [slots] = await connection.execute(
        `SELECT id FROM interviewer_availability
         WHERE interviewer_id = ? AND status = 'Available'
           AND available_from <= ? AND available_to >= ?
         ORDER BY available_from ASC LIMIT 1 FOR UPDATE`,
        [interviewerId, sessionStart, sessionEnd]
      );
      if (!slots.length) {
        await connection.rollback();
        return res.status(409).json({ message: 'This interviewer does not have an available slot covering the requested interview time.' });
      }
      if (availabilityId) {
        await connection.execute("UPDATE interviewer_availability SET status = 'Available' WHERE id = ? AND status = 'Booked'", [availabilityId]);
      }
      availabilityId = slots[0].id;
      await connection.execute("UPDATE interviewer_availability SET status = 'Booked' WHERE id = ?", [availabilityId]);
    } else if ((value.status === 'Requested' || value.status === 'Cancelled' || !interviewer) && availabilityId) {
      await connection.execute("UPDATE interviewer_availability SET status = 'Available' WHERE id = ? AND status = 'Booked'", [availabilityId]);
      availabilityId = null;
    }
    const [result] = await connection.execute(
      `UPDATE mock_interviews
       SET status = ?, interviewer_id = ?, availability_id = ?, assignment_status = ?, assigned_at = ?,
         assigned_to = ?, interviewer_email = ?, meeting_link = ?, admin_notes = ?
       WHERE id = ?`,
      [value.status, interviewerId, availabilityId, assignmentStatus, interviewer ? new Date() : null,
        interviewer?.name || null, interviewer?.email || null, value.meeting_link || null, value.admin_notes || null, id.data]
    );
    await connection.commit();
    if (!result.affectedRows) return res.status(404).json({ message: 'Interview request not found.' });
    res.json({ message: value.status === 'Scheduled' ? 'Interview scheduled and sent to the interviewer workspace.' : 'Interview request updated.' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

export default router;
