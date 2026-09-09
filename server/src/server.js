require('./lib/env');

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const hpp = require('hpp');

const { ApiError } = require('./lib/errors');
const { globalLimiter } = require('./middleware/limits');

const app = express();

// Render / Vercel / any reverse proxy: needed for correct client IPs in rate limiting.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ------------------------------------------------------------ security headers
app.use(helmet({
  contentSecurityPolicy: false, // JSON API, no HTML surface
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'no-referrer' },
}));

// ------------------------------------------------------------ CORS
const origins = (process.env.CORS_ORIGINS || '*').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    // Native apps send no Origin header - always allowed.
    if (!origin) return cb(null, true);
    if (origins.includes('*') || origins.includes(origin)) return cb(null, true);
    return cb(new Error('Origin not allowed by CORS'));
  },
  credentials: false,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  maxAge: 86400,
}));

// ------------------------------------------------------------ parsing & hygiene
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));
app.use(hpp());
app.use(compression());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'tiny' : 'dev'));
}

// Reject oversized or deeply nested payloads early.
app.use((req, _res, next) => {
  const depth = (obj, d = 0) => {
    if (d > 6 || obj === null || typeof obj !== 'object') return d;
    return Math.max(d, ...Object.values(obj).map((v) => depth(v, d + 1)));
  };
  if (req.body && depth(req.body) > 6) {
    return next(new ApiError(400, 'بنية الطلب معقدة أكثر من اللازم', 'bad_payload'));
  }
  next();
});

// ------------------------------------------------------------ health
app.get('/', (_req, res) => res.json({ name: 'stores-manager-api', status: 'ok' }));
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ------------------------------------------------------------ routes
app.use('/api', globalLimiter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/stores', require('./routes/stores'));
app.use('/api/products', require('./routes/products'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/purchases', require('./routes/purchases'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/stats', require('./routes/stats'));

// ------------------------------------------------------------ 404 + errors
app.use((_req, res) => res.status(404).json({ error: 'الرابط غير موجود', code: 'not_found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'حجم الطلب كبير جدا', code: 'too_large' });
  }
  if (err && /CORS/.test(err.message || '')) {
    return res.status(403).json({ error: 'مصدر الطلب غير مسموح', code: 'cors' });
  }
  if (err && err.code === '23505') {
    return res.status(409).json({ error: 'هذا السجل موجود من قبل', code: 'conflict' });
  }
  if (err && err.code === '23503') {
    return res.status(400).json({ error: 'سجل مرتبط غير موجود', code: 'fk_violation' });
  }
  // معرّف غير صالح في المسار: خطأ في الطلب لا في الخادم
  if (err && (err.code === '22P02' || err.code === '22003')) {
    return res.status(400).json({ error: 'معرّف غير صالح في الطلب', code: 'bad_identifier' });
  }
  console.error('[error]', err);
  // Never leak internals to the client.
  res.status(500).json({ error: 'حدث خطأ من جهتنا', code: 'server_error' });
});

const port = Number(process.env.PORT || 4000);

// Hosts that boot with a bare `node server.js` get their schema applied here.
// The schema is idempotent, so this is a no-op on every deploy after the first.
// Set MIGRATE_ON_BOOT=false if you would rather run `npm run migrate` yourself.
async function bootstrap() {
  if (process.env.MIGRATE_ON_BOOT !== 'false') {
    try {
      const { runMigrations } = require('./db/migrate');
      await runMigrations();
    } catch (err) {
      console.error('FATAL: could not prepare the database:', err.message);
      process.exit(1);
    }
  }

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`stores-manager API listening on :${port}`);
  });

  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => {
      console.log(`${sig} received, closing`);
      server.close(() => process.exit(0));
    });
  }
}

if (require.main === module || process.env.NODE_ENV !== 'test') bootstrap();

module.exports = app;
