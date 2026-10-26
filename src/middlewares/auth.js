const AppError = require('../utils/AppError');
const { ROLES } = require('../utils/constants');
const { wantsJson } = require('../utils/http');

/** Wajib login. Route publik TIDAK memakai middleware ini. */
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  if (wantsJson(req)) return next(new AppError('Silakan login terlebih dahulu.', 401));

  // Simpan tujuan hanya untuk GET agar tidak me-replay POST setelah login
  if (req.method === 'GET') req.session.returnTo = req.originalUrl;
  req.flash('error', 'Silakan login terlebih dahulu.');
  return res.redirect('/auth/login');
}

/** Hanya untuk tamu (mis. halaman login). */
function ensureGuest(req, res, next) {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  return next();
}

/**
 * RBAC: izinkan hanya role tertentu.
 * Contoh: router.use(requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN))
 */
function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.isAuthenticated()) return ensureAuthenticated(req, res, next);
    if (allowed.includes(req.user.role)) return next();
    return next(new AppError('Anda tidak memiliki akses ke halaman ini.', 403));
  };
}

const isSuperAdmin = requireRole(ROLES.SUPER_ADMIN);
const isAdmin = requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN);
const canManageEvents = requireRole(ROLES.ADMIN, ROLES.HMP); // Kaprodi & HMP

module.exports = {
  ensureAuthenticated,
  ensureGuest,
  requireRole,
  isSuperAdmin,
  isAdmin,
  canManageEvents,
};
