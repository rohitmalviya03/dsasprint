import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import passport from 'passport';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { isConfiguredAdmin, requireAuth } from '../middleware/auth.js';
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

function resetLink(token) {
  return `${clientUrl()}/?reset_token=${encodeURIComponent(token)}`;
}

function resetTokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function mailTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass }
  });
}

const signupSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email().transform(v => v.toLowerCase()),
  password: z.string().min(8).max(100),
  contact_number: z.string().trim().regex(/^\+?[0-9][0-9\s-]{7,18}$/, 'Invalid contact number')
});

const interviewerSignupSchema = signupSchema.extend({
  headline: z.string().trim().max(150).nullable().optional(),
  company: z.string().trim().max(120).nullable().optional(),
  experience_years: z.number().int().min(0).max(70),
  expertise: z.string().trim().min(2).max(500),
  linkedin_url: z.string().url().max(1000).nullable().optional().or(z.literal('')),
  bio: z.string().trim().min(20).max(2000)
});

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    contact_number: user.contact_number,
    provider: user.provider,
    avatar_url: user.avatar_url,
    is_admin: isConfiguredAdmin(user.email, user.account_role),
    is_interviewer: user.account_role === 'interviewer',
    account_role: user.account_role || 'user'
  };
}

router.post('/signup', asyncHandler(async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid signup data', errors: parsed.error.flatten() });
  const { name, email, password, contact_number: contactNumber } = parsed.data;
  const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) return res.status(409).json({ message: 'Email already registered' });
  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, 12);
  await pool.execute('INSERT INTO users (id, name, email, contact_number, password_hash, provider) VALUES (?, ?, ?, ?, ?, "local")', [id, name, email, contactNumber, passwordHash]);
  const user = publicUser({ id, name, email, contact_number: contactNumber, provider: 'local', avatar_url: null, account_role: 'user' });
  const token = signToken(user);
  setAuthCookie(res, token);
  res.status(201).json({ user });
}));

router.post('/interviewer-signup', asyncHandler(async (req, res) => {
  const parsed = interviewerSignupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Complete all interviewer application fields with valid contact and profile details.' });
  const value = parsed.data;
  const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [value.email]);
  if (existing.length) return res.status(409).json({ message: 'Email already registered. Use another email for an interviewer application.' });
  const id = uuidv4();
  const passwordHash = await bcrypt.hash(value.password, 12);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO users (id, name, email, contact_number, password_hash, provider, account_role)
       VALUES (?, ?, ?, ?, ?, 'local', 'interviewer')`,
      [id, value.name, value.email, value.contact_number, passwordHash]
    );
    await connection.execute(
      `INSERT INTO interviewer_profiles
        (user_id, headline, company, experience_years, expertise, linkedin_url, bio, is_active, approved_by, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, NULL, NULL)`,
      [id, value.headline || null, value.company || null, value.experience_years, value.expertise, value.linkedin_url || null, value.bio]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  res.status(201).json({ message: 'Application submitted. You can sign in after an admin approves and activates your interviewer account.' });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const schema = z.object({ email: z.string().email().transform(v => v.toLowerCase()), password: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid login data' });
  const [rows] = await pool.execute('SELECT * FROM users WHERE email = ? LIMIT 1', [parsed.data.email]);
  if (!rows.length || !rows[0].password_hash) return res.status(401).json({ message: 'Invalid email or password' });
  const ok = await bcrypt.compare(parsed.data.password, rows[0].password_hash);
  if (!ok) return res.status(401).json({ message: 'Invalid email or password' });
  if (rows[0].account_role === 'interviewer') {
    const [profiles] = await pool.execute('SELECT is_active FROM interviewer_profiles WHERE user_id = ? LIMIT 1', [rows[0].id]);
    if (!profiles[0]?.is_active) {
      return res.status(403).json({ message: 'Your interviewer application is waiting for admin approval and activation.' });
    }
  }
  const user = publicUser(rows[0]);
  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({ user });
}));

router.post('/forgot-password', asyncHandler(async (req, res) => {
  const parsed = z.object({
    email: z.string().email().transform((value) => value.toLowerCase())
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Enter a valid email address.' });

  const response = { message: 'If that email has a local account, a reset link has been sent.' };
  const [users] = await pool.execute(
    'SELECT id, email, name, password_hash FROM users WHERE email = ? LIMIT 1',
    [parsed.data.email]
  );
  if (!users.length || !users[0].password_hash) return res.json(response);

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = resetTokenHash(token);
  const expiresAt = new Date(Date.now() + (30 * 60 * 1000));
  await pool.execute('DELETE FROM password_reset_tokens WHERE user_id = ? OR expires_at < CURRENT_TIMESTAMP', [users[0].id]);
  await pool.execute(
    'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [users[0].id, tokenHash, expiresAt]
  );

  const link = resetLink(token);
  const transport = mailTransport();
  if (transport) {
    try {
      await transport.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to: users[0].email,
        subject: 'Reset your DSASprint password',
        text: `Hi ${users[0].name}, reset your DSASprint password using this link within 30 minutes: ${link}\n\nIf you did not request this, you can ignore this email.`
      });
    } catch (error) {
      console.error('Unable to send password reset email:', error.message);
    }
  } else if (process.env.NODE_ENV !== 'production') {
    return res.json({ ...response, reset_url: link });
  } else {
    console.error('Password reset requested but SMTP is not configured.');
  }

  res.json(response);
}));

router.post('/reset-password', asyncHandler(async (req, res) => {
  const parsed = z.object({
    token: z.string().min(32).max(200),
    password: z.string().min(8).max(100)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Use a valid reset link and a password of at least 8 characters.' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [tokens] = await connection.execute(
      `SELECT password_reset_tokens.id, password_reset_tokens.user_id
       FROM password_reset_tokens
       INNER JOIN users ON users.id = password_reset_tokens.user_id
       WHERE password_reset_tokens.token_hash = ?
         AND password_reset_tokens.used_at IS NULL
         AND password_reset_tokens.expires_at > CURRENT_TIMESTAMP
         AND users.password_hash IS NOT NULL
       LIMIT 1
       FOR UPDATE`,
      [resetTokenHash(parsed.data.token)]
    );
    if (!tokens.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'This password reset link is invalid or has expired.' });
    }
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    await connection.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, tokens[0].user_id]);
    await connection.execute('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?', [tokens[0].id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  res.json({ message: 'Password reset successfully. Sign in with your new password.' });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT users.id, users.name, users.email, users.contact_number, users.avatar_url,
       users.provider, users.account_role, users.created_at, interviewer_profiles.is_active AS interviewer_active
     FROM users
     LEFT JOIN interviewer_profiles ON interviewer_profiles.user_id = users.id
     WHERE users.id = ?`,
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ message: 'User not found' });
  if (rows[0].account_role === 'interviewer' && !rows[0].interviewer_active) {
    return res.status(403).json({ message: 'Your interviewer account is awaiting approval or currently inactive.' });
  }
  res.json({ user: { ...publicUser(rows[0]), created_at: rows[0].created_at } });
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
