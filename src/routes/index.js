const { Router } = require('express');
const publicRoutes = require('./public.routes');
const authRoutes = require('./auth.routes');
const appRoutes = require('./app.routes');
const apiRoutes = require('./api');
const { ensureAuthenticated } = require('../middlewares/auth');

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ---------------------------------------------------------------------
// PUBLIK (tanpa login): landing, verifikasi QR, portal pencarian sertifikat.
// Auth middleware sengaja TIDAK dipasang global agar route ini tidak terblokir.
// ---------------------------------------------------------------------
router.use('/', publicRoutes);
router.use('/auth', authRoutes);

// ---------------------------------------------------------------------
// TERPROTEKSI (login + RBAC per kelompok route)
// ---------------------------------------------------------------------
router.use(['/dashboard', '/events', '/approvals', '/signatures', '/admin'], ensureAuthenticated);
router.use('/', appRoutes);

// REST API (JSON). Endpoint /api/public/* tanpa login; sisanya login + RBAC.
router.use('/api', apiRoutes);

module.exports = router;
