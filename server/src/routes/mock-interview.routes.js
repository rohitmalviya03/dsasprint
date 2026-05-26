import express from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', (_req, res) => {
  res.json({ interviews: [], comingSoon: true });
});

router.post('/', (_req, res) => {
  res.status(503).json({ message: 'Mock interview scheduling is coming soon.' });
});

router.patch('/:id/cancel', (_req, res) => {
  res.status(503).json({ message: 'Mock interview scheduling is coming soon.' });
});

export default router;
