const config = require('../config');
const { wantsJson } = require('../utils/http');

function notFound(req, res) {
  res.status(404);
  if (wantsJson(req)) {
    return res.json({ success: false, message: 'Resource tidak ditemukan.' });
  }
  return res.render('errors/error', {
    title: 'Halaman Tidak Ditemukan',
    statusCode: 404,
    message: 'Halaman yang Anda cari tidak tersedia atau telah dipindahkan.',
  });
}

// eslint-disable-next-line no-unused-vars
const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: [413, 'Ukuran file melebihi batas yang diizinkan.'],
  LIMIT_FILE_COUNT: [400, 'Terlalu banyak file diunggah.'],
  LIMIT_UNEXPECTED_FILE: [400, 'Field file tidak dikenali.'],
};

function errorHandler(err, req, res, next) {
  if (err.name === 'MulterError') {
    const [status, msg] = MULTER_MESSAGES[err.code] || [400, 'Upload file gagal.'];
    err.statusCode = status;
    err.message = msg;
  }
  const statusCode = err.statusCode || err.status || 500;
  if (statusCode >= 500) console.error(err);

  // Respons sudah terkirim (mis. gagal simpan session setelah render) -> serahkan ke Express
  if (res.headersSent) return next(err);

  // Jangan bocorkan detail error di production
  const message = statusCode < 500 || !config.isProd
    ? err.message
    : 'Terjadi kesalahan pada server.';

  res.status(statusCode);
  if (wantsJson(req)) {
    return res.json({ success: false, message });
  }
  return res.render('errors/error', {
    title: statusCode >= 500 ? 'Kesalahan Server' : 'Terjadi Kesalahan',
    statusCode,
    message,
  });
}

module.exports = { notFound, errorHandler };
