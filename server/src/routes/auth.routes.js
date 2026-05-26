import express from 'express';
import bcrypt from 'bcryptjs';
import passport from 'passport';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { signToken, setAuthCookie } from '../auth/jwt.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = express.Router();

function clientUrl() {
  return (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim();
}

function googleAuthAvailable(_req, res, next) {
  const id = process.env.GOOGLE_CLIENT_ID || '';
  const secret = process.env.GOOGLE_CLIENT_SECRET || '';
  const ready = id && secret && !id.includes('your_') && !secret.includes('your_');
  if (!ready) return res.redirect(`${clientUrl()}/?auth=google_unavailable`);
  return next();
}

const signupSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email().transform(v => v.toLowerCase()),
  password: z.string().min(8).max(100),
  contact_number: z.string().trim().regex(/^\+?[0-9][0-9\s-]{7,18}$/, 'Invalid contact number')
});

router.post('/signup', asyncHandler(async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid signup data', errors: parsed.error.flatten() });
  const { name, email, password, contact_number: contactNumber } = parsed.data;
  const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) return res.status(409).json({ message: 'Email already registered' });
  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, 12);
  await pool.execute('INSERT INTO users (id, name, email, contact_number, password_hash, provider) VALUES (?, ?, ?, ?, ?, "local")', [id, name, email, contactNumber, passwordHash]);
  const user = { id, name, email, contact_number: contactNumber, provider: 'local', avatar_url: null };
  const token = signToken(user);
  setAuthCookie(res, token);
  res.status(201).json({ user });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const schema = z.object({ email: z.string().email().transform(v => v.toLowerCase()), password: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid login data' });
  const [rows] = await pool.execute('SELECT * FROM users WHERE email = ? LIMIT 1', [parsed.data.email]);
  if (!rows.length || !rows[0].password_hash) return res.status(401).json({ message: 'Invalid email or password' });
  const ok = await bcrypt.compare(parsed.data.password, rows[0].password_hash);
  if (!ok) return res.status(401).json({ message: 'Invalid email or password' });
  const user = { id: rows[0].id, name: rows[0].name, email: rows[0].email, contact_number: rows[0].contact_number, provider: rows[0].provider, avatar_url: rows[0].avatar_url };
  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({ user });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const [rows] = await pool.execute('SELECT id, name, email, contact_number, avatar_url, provider, created_at FROM users WHERE id = ?', [req.user.id]);
  if (!rows.length) return res.status(404).json({ message: 'User not found' });
  res.json({ user: rows[0] });
}));

router.post('/logout', (_req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production'
  });
  res.json({ message: 'Logged out' });
});

router.get('/google', googleAuthAvailable, passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
router.get('/google/callback', googleAuthAvailable, passport.authenticate('google', { failureRedirect: `${clientUrl()}/?auth=failed`, session: false }), (req, res) => {
  const token = signToken(req.user);
  setAuthCookie(res, token);
  res.redirect(`${clientUrl()}/?auth=success`);
});

export default router;
