import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import dotenv from 'dotenv';
import { initDatabase } from './db/database';
import { initSupabaseAdminRealtime } from './db/supabase';
import authRoutes from './routes/auth';
import eventRoutes from './routes/event';
import registrationRoutes from './routes/registrations';
import scannerRoutes from './routes/scanner';
import sheetsRoutes from './routes/sheets';
import exportRoutes from './routes/export';
import statsRoutes from './routes/stats';
import paymentRoutes from './routes/payment';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Database schema and seed data
initDatabase();

// Initialize real-time automated Supabase admin synchronization
initSupabaseAdminRealtime();

// Security & Middleware (Bulletproof CORS: allows credentials and reflects request origin across any domain/subdomain/port)
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
}));

// Preflight handler for all routes
app.options('*', cors());

// HTTP Security Headers (OWASP Recommended)
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com")');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  // Strict Content-Security-Policy
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://api.fontshare.com",
    "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://*.supabase.co wss://*.supabase.co",
    "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
    "img-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com",
    "font-src 'self' https://fonts.gstatic.com https://api.fontshare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  res.setHeader('Content-Security-Policy', cspDirectives);

  next();
});

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static uploaded files with strict sandbox headers to prevent Stored XSS
const uploadsPath = path.resolve(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadsPath, {
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  },
}));

// API Route Mounts
app.use('/api/auth', authRoutes);
app.use('/api/event', eventRoutes);
app.use('/api/registrations', registrationRoutes);
app.use('/api/scanner', scannerRoutes);
app.use('/api/sheets', sheetsRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/payment', paymentRoutes);

// Direct Razorpay Standard Checkout Endpoints
app.post('/api/create-order', (req: Request, res: Response, next: NextFunction) => {
  req.url = '/create-order';
  paymentRoutes(req, res, next);
});
app.post('/api/verify-payment', (req: Request, res: Response, next: NextFunction) => {
  req.url = '/verify-payment';
  paymentRoutes(req, res, next);
});

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString(), platform: 'FOT Platform' });
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`⚡ FOT Server running on http://127.0.0.1:${PORT}`);
});
