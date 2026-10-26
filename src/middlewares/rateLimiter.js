const { rateLimit } = require('express-rate-limit');
const config = require('../config');
const { wantsJson } = require('../utils/http');

const handler = (req, res, _next, options) => {
  res.status(options.statusCode);
  if (wantsJson(req)) {
    return res.json({ success: false, message: 'Terlalu banyak permintaan. Coba lagi nanti.' });
  }
  return res.render('errors/error', {
    title: 'Terlalu Banyak Permintaan',
    statusCode: options.statusCode,
    message: 'Anda mengirim terlalu banyak permintaan. Silakan coba lagi beberapa menit lagi.',
  });
};

// Limiter umum untuk seluruh aplikasi
const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.max,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler,
});

// Limiter ketat untuk route publik (pencarian & verifikasi sertifikat)
const publicLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.publicMax,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler,
});

// Limiter untuk login (anti brute-force), dipakai di Tahap 2
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler,
});

module.exports = { globalLimiter, publicLimiter, authLimiter };
