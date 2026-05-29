import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import passport from 'passport';
import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import authRoutes from './routes/auth.routes.js';
import progressRoutes from './routes/progress.routes.js';
import feedbackRoutes from './routes/feedback.routes.js';
import mockInterviewRoutes from './routes/mock-interview.routes.js';
import contentRoutes from './routes/content.routes.js';
import adminRoutes from './routes/admin.routes.js';
import interviewerRoutes from './routes/interviewer.routes.js';
import atsRoutes from './routes/ats.routes.js';
import { configureGoogleAuth } from './auth/google.js';
import { logger } from './utils/logger.js';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(serverDir, '../.env') });
configureGoogleAuth();

const app = express();
app.set('trust proxy', 1);

// Allow local frontend during development and configured frontend in production.
// Example CLIENT_URL=http://localhost:5173 or https://yourdomain.com
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsDefaults = {
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
};

function ownOrigin(req) {
  const forwardedHost = req.get('x-forwarded-host')?.split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  if (!host) return null;
  const forwardedProtocol = req.get('x-forwarded-proto')?.split(',')[0].trim();
  return `${forwardedProtocol || req.protocol}://${host}`;
}

function corsOptionsFor(req) {
  return {
    ...corsDefaults,
    origin(origin, callback) {
      // Allow server-to-server clients and the frontend served from this host.
      if (!origin) return callback(null, true);
      if (origin === ownOrigin(req) || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  };
}

app.use((req, res, next) => cors(corsOptionsFor(req))(req, res, next));
app.options('*', (req, res, next) => cors(corsOptionsFor(req))(req, res, next));

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use((req, res, next) => {
  req.id = req.get('x-request-id') || randomUUID();
  const startedAt = Date.now();
  res.setHeader('x-request-id', req.id);
  res.on('finish', () => {
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]('http_request', {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      userId: req.user?.id
    });
  });
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(passport.initialize());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again later.' }
});

app.get('/health', (_req, res) => res.json({ ok: true, allowedOrigins }));
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/interviewer-signup', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/mock-interviews', mockInterviewRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/interviewer', interviewerRoutes);
app.use('/api/ats', atsRoutes);

const clientDist = path.resolve(serverDir, '../../client/dist');
const clientEntry = path.join(clientDist, 'index.html');
if (existsSync(clientEntry)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path === '/health' || req.path.startsWith('/api/')) return next();
    return res.sendFile(clientEntry);
  });
}

app.use((err, req, res, _next) => {
  logger.error('unhandled_error', {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    statusCode: err.statusCode || 500,
    errorName: err.name,
    message: err.message || String(err),
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
  });
  const message = process.env.NODE_ENV === 'production' ? 'Server error' : (err.message || 'Server error');
  res.status(err.statusCode || 500).json({ message, requestId: req.id });
});

const port = Number(process.env.PORT || 5000);
app.listen(port, () => logger.info('server_started', { port, url: `http://localhost:${port}` }));
