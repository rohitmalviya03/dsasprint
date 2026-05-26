import express from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = express.Router();

const feedbackSchema = z.object({
  category: z.enum(['Feature request', 'Bug report', 'Experience', 'Other']),
  rating: z.number().int().min(1).max(5),
  message: z.string().trim().min(10).max(2000)
});

router.use(requireAuth);

router.post('/', asyncHandler(async (req, res) => {
  const parsed = feedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Please add a rating and at least 10 characters of feedback.' });
  }
  const { category, rating, message } = parsed.data;
  await pool.execute(
    'INSERT INTO feedback (user_id, category, rating, message) VALUES (?, ?, ?, ?)',
    [req.user.id, category, rating, message]
  );
  res.status(201).json({ message: 'Thanks for your feedback.' });
}));

export default router;
