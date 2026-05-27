import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/pool.js';

export function configureGoogleAuth() {
  if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID.includes('your_')) return;

  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  }, async (_accessToken, _refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value?.toLowerCase();
      if (!email) return done(new Error('Google account email not found'));
      const name = profile.displayName || email.split('@')[0];
      const avatar = profile.photos?.[0]?.value || null;
      const [existing] = await pool.execute('SELECT * FROM users WHERE email = ? OR google_id = ? LIMIT 1', [email, profile.id]);
      if (existing.length) {
        await pool.execute('UPDATE users SET google_id = ?, avatar_url = ?, provider = IF(provider="local","local","google") WHERE id = ?', [profile.id, avatar, existing[0].id]);
        const [rows] = await pool.execute('SELECT id, name, email, contact_number, avatar_url, provider, account_role FROM users WHERE id = ?', [existing[0].id]);
        return done(null, rows[0]);
      }
      const id = uuidv4();
      await pool.execute('INSERT INTO users (id, name, email, google_id, avatar_url, provider) VALUES (?, ?, ?, ?, ?, "google")', [id, name, email, profile.id, avatar]);
      return done(null, { id, name, email, contact_number: null, avatar_url: avatar, provider: 'google', account_role: 'user' });
    } catch (err) {
      return done(err);
    }
  }));
}
