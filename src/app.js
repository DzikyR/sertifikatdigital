const path = require('path');
const express = require('express');
const compression = require('compression');
const morgan = require('morgan');
const flash = require('connect-flash');

const config = require('./config');
const { helmetMiddleware } = require('./config/security');
const { sessionMiddleware } = require('./config/session');
const passport = require('./config/passport');
const { globalLimiter } = require('./middlewares/rateLimiter');
const { csrfProtection, exposeCsrfToken, csrfErrorHandler } = require('./middlewares/csrf');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const { ROLE_LABELS, EVENT_STATUS_META, EMAIL_STATUS_META, ORGANIZER_LABELS } = require('./utils/constants');
const { formatDateId } = require('./utils/format');
const prisma = require('./config/database');
const featureService = require('./services/featureService');
const brandingService = require('./services/brandingService');
const storage = require('./utils/storage');
const routes = require('./routes');

const app = express();

// ---- Core settings ----
app.set('trust proxy', config.trustProxy);
app.set('view engine', 'ejs');
app.set('views', config.paths.views);
app.disable('x-powered-by');

// Helper global untuk semua view
Object.assign(app.locals, {
  EVENT_STATUS_META,
  EMAIL_STATUS_META,
  ORGANIZER_LABELS,
  fmtDate: formatDateId,
  fmtDateTime: (d) => (d ? new Date(d).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }) : '-'),
  fmtNumber: (n) => Number(n || 0).toLocaleString('id-ID'),
});

// ---- Security & performance ----
app.use(helmetMiddleware());
app.use(compression());
app.use(morgan(config.isProd ? 'combined' : 'dev'));

// ---- Static assets (hanya /public; storage/ TIDAK diekspos) ----
app.use(express.static(config.paths.public, { maxAge: config.isProd ? '7d' : 0 }));
app.get('/favicon.ico', (req, res) => res.redirect(301, '/favicon.svg'));
// Vendor: hanya file UMD Fabric.js yang diekspos (dilayani same-origin agar lolos CSP)
app.get('/vendor/fabric.min.js', (req, res) => {
  res.sendFile(path.join(config.paths.root, 'node_modules/fabric/dist/index.min.js'), { maxAge: config.isProd ? '7d' : 0 });
});

// ---- Locals dasar (tersedia juga untuk halaman error) ----
app.use((req, res, next) => {
  res.locals.brand = brandingService.get(); // diperbarui lagi setelah refresh cache di bawah
  res.locals.appName = res.locals.brand.appName;
  res.locals.currentPath = req.path;
  res.locals.currentYear = new Date().getFullYear();
  res.locals.user = null;
  res.locals.roleLabels = ROLE_LABELS;
  res.locals.flash = { success: [], error: [] };
  res.locals.oldInput = {};
  // feature('kunci') di view: status fitur untuk user saat ini (dibaca saat render)
  res.locals.feature = (key) => featureService.isEnabled(key, req.user?.role);
  next();
});

app.use(globalLimiter);

// Sinkronkan cache pengaturan fitur & tampilan secara berkala
app.use(async (req, res, next) => {
  await Promise.all([featureService.refreshIfStale(), brandingService.refreshIfStale()]);
  res.locals.brand = brandingService.get();
  res.locals.appName = res.locals.brand.appName;
  next();
});

// ---- Tampilan yang diatur Super Admin (publik): CSS warna tema & logo ----
// URL memuat ?v=<versi> sehingga aman di-cache lama; berubah setiap pengaturan disimpan.
app.get('/theme.css', (req, res) => {
  res.set({ 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': req.query.v ? 'public, max-age=31536000, immutable' : 'no-cache' });
  res.send(brandingService.themeCss());
});
app.get('/branding/logo', (req, res, next) => {
  const rel = brandingService.logoPath();
  if (!rel) return res.redirect('/favicon.svg');
  res.set('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'no-cache');
  return res.type('png').sendFile(storage.absPath(rel), (err) => err && next());
});

// ---- Body parsers (dengan batas ukuran) ----
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(express.json({ limit: '1mb' }));

// ---- Session, flash, auth ----
app.use(sessionMiddleware());
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());

// ---- CSRF (semua method non-GET/HEAD/OPTIONS wajib token) ----
app.use(exposeCsrfToken);
app.use(csrfProtection);

// ---- Locals berbasis session ----
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.pendingApprovals = 0;
  res.locals.pendingUsers = 0;
  // Baca flash hanya bila ada: req.flash() selalu menginisialisasi session,
  // yang akan membuat baris session untuk setiap pengunjung publik.
  if (req.session?.flash) {
    res.locals.flash = { success: req.flash('success'), error: req.flash('error') };
    try {
      res.locals.oldInput = JSON.parse(req.flash('oldInput')[0] || '{}');
    } catch {
      res.locals.oldInput = {};
    }
  }
  next();
});

// Badge sidebar: draf menunggu persetujuan (Kaprodi/Admin Prodi) & permintaan akses (Super Admin)
app.use(async (req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    if (req.user?.role === 'ADMIN') res.locals.pendingApprovals = await prisma.event.count({ where: { status: 'PENDING_APPROVAL' } });
    if (req.user?.role === 'SUPER_ADMIN') res.locals.pendingUsers = await prisma.user.count({ where: { approvalStatus: 'PENDING' } });
  }
  next();
});

// ---- Routes ----
app.use('/', routes);

// ---- Error handling ----
app.use(notFound);
app.use(csrfErrorHandler);
app.use(errorHandler);

module.exports = app;
