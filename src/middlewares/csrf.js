const { csrfSync } = require('csrf-sync');

// Synchronizer Token Pattern (token disimpan di session).
// Token dikirim lewat field form `_csrf` atau header `X-CSRF-Token` (fetch/AJAX/multipart).
const { csrfSynchronisedProtection, generateToken } = csrfSync({
  getTokenFromRequest: (req) => req.body?._csrf || req.get('x-csrf-token'),
});

/**
 * Sediakan token ke view sebagai fungsi `csrfToken()`.
 * Lazy: token (dan session) baru dibuat saat view benar-benar memakai form,
 * sehingga pengunjung halaman publik tidak membuat baris session baru.
 */
function exposeCsrfToken(req, res, next) {
  res.locals.csrfToken = () => generateToken(req);
  next();
}

/** Ubah error CSRF menjadi 403 yang ramah. */
function csrfErrorHandler(err, req, res, next) {
  if (err?.code !== 'EBADCSRFTOKEN') return next(err);
  err.statusCode = 403;
  err.message = 'Sesi formulir kedaluwarsa atau tidak valid. Muat ulang halaman lalu coba lagi.';
  return next(err);
}

module.exports = { csrfProtection: csrfSynchronisedProtection, exposeCsrfToken, csrfErrorHandler, generateToken };
