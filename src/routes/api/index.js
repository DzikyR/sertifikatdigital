const { Router } = require('express');
const { ensureAuthenticated, isSuperAdmin, requireRole } = require('../../middlewares/auth');
const { publicLimiter } = require('../../middlewares/rateLimiter');
const v = require('../../validators/apiValidators');
const validate = require('../../middlewares/validate');
const { requireFeature } = require('../../middlewares/feature');
const { generateToken } = require('../../middlewares/csrf');
const publicController = require('../../controllers/api/publicController');
const dashboardController = require('../../controllers/api/dashboardController');
const eventRoutes = require('./events.routes');
const adminRoutes = require('./admin.routes');
const fontRoutes = require('./fonts.routes');
const signatureRoutes = require('./signatures.routes');

const router = Router();

// ---------------- PUBLIK (tanpa login, rate-limited ketat) ----------------
router.get('/public/verify/:code', publicLimiter, publicController.verify);
router.get('/public/search', publicLimiter, requireFeature('public.search'), v.publicSearch, validate, publicController.search);

// ---------------- TERPROTEKSI ----------------
router.use(ensureAuthenticated);

// Token CSRF untuk klien fetch/AJAX (kirim balik via header X-CSRF-Token)
router.get('/csrf-token', (req, res) => res.json({ csrfToken: generateToken(req) }));

router.get('/dashboard/stats', dashboardController.stats);
router.use('/events', requireRole('ADMIN', 'HMP'), eventRoutes);
router.use('/fonts', requireRole('ADMIN', 'HMP'), fontRoutes);
router.use('/signatures', requireRole('ADMIN', 'HMP'), signatureRoutes);
router.use('/admin', isSuperAdmin, adminRoutes);

module.exports = router;
