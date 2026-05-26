import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import passport from 'passport';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import progressRoutes from './routes/progress.routes.js';
import feedbackRoutes from './routes/feedback.routes.js';
import { configureGoogleAuth } from './auth/google.js';

dotenv.config();
configureGoogleAuth();

const app = express();

// Allow local frontend during development and configured frontend in production.
// Example CLIENT_URL=http://localhost:5173 or https://yourdomain.com
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // Allow tools like Postman/curl where origin is missing
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(helmet({ crossOriginResourcePolicy: false }));
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
app.use('/api/auth', authRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/feedback', feedbackRoutes);

app.use((err, _req, res, _next) => {
  console.error(err.message || err);
  const message = process.env.NODE_ENV === 'production' ? 'Server error' : (err.message || 'Server error');
  res.status(500).json({ message });
});

const port = Number(process.env.PORT || 5000);
app.listen(port, () => console.log(`API running on http://localhost:${port}`));
