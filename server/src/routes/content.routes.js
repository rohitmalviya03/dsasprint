import express from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = express.Router();

router.get('/problems', asyncHandler(async (_req, res) => {
  const [problems] = await pool.execute(
    `SELECT problem_key AS id, category, name, difficulty, rating, companies, article, video, initial_status AS status
     FROM admin_problems
     WHERE is_published = TRUE
     ORDER BY created_at ASC`
  );
  res.json({ problems });
}));

router.get('/study-plans', asyncHandler(async (_req, res) => {
  const [plans] = await pool.execute(
    `SELECT id, title, description, duration_days
     FROM study_plans
     WHERE is_published = TRUE
     ORDER BY created_at DESC`
  );
  if (!plans.length) return res.json({ plans: [] });
  const [items] = await pool.execute(
    `SELECT study_plan_id, problem_id, day_number, item_order
     FROM study_plan_items
     WHERE study_plan_id IN (${plans.map(() => '?').join(',')})
     ORDER BY day_number ASC, item_order ASC`,
    plans.map((plan) => plan.id)
  );
  res.json({
    plans: plans.map((plan) => ({
      ...plan,
      items: items.filter((item) => item.study_plan_id === plan.id)
    }))
  });
}));

export default router;
