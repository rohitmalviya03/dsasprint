import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const token = req.cookies?.token || bearer;
  if (!token) return res.status(401).json({ message: 'Login required' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired session' });
  }
}

function configuredAdminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireAdmin(req, res, next) {
  try {
    const [rows] = await pool.execute('SELECT email, account_role FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    const user = rows[0];
    const configured = configuredAdminEmails().includes(String(user?.email || '').toLowerCase());
    if (!user || (user.account_role !== 'admin' && !configured)) {
      return res.status(403).json({ message: 'Admin access required' });
    }
    req.user.is_admin = true;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function isConfiguredAdmin(email, accountRole) {
  return accountRole === 'admin' || configuredAdminEmails().includes(String(email || '').toLowerCase());
}
