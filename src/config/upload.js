const multer = require('multer');
const AppError = require('../utils/AppError');

// Semua upload disimpan di memori dulu, lalu divalidasi ulang (magic bytes via sharp /
// parser CSV) sebelum ditulis ke storage/ dengan nama acak.
function memoryUpload({ maxMb, mimes, label }) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1, fields: 20 },
    fileFilter: (req, file, cb) => {
      if (mimes.includes(file.mimetype)) return cb(null, true);
      return cb(new AppError(`${label} harus berformat ${mimes.map((m) => m.split('/')[1].toUpperCase()).join('/')}.`, 415));
    },
  });
}

const templateUpload = memoryUpload({ maxMb: 10, mimes: ['image/png', 'image/jpeg'], label: 'Template sertifikat' });
const signatureUpload = memoryUpload({ maxMb: 2, mimes: ['image/png'], label: 'File tanda tangan' });
const logoUpload = memoryUpload({ maxMb: 5, mimes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'], label: 'File logo' });
// MIME file CSV/Excel dari browser tidak konsisten (Windows sering mengirim
// application/vnd.ms-excel untuk .csv), jadi filter berdasarkan ekstensi; isi divalidasi parser.
function extUpload({ maxMb, exts, label }) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1, fields: 20 },
    fileFilter: (req, file, cb) => {
      const ext = (file.originalname.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
      if (exts.includes(ext)) return cb(null, true);
      return cb(new AppError(`${label} harus berformat ${exts.map((e) => e.toUpperCase()).join('/')}.`, 415));
    },
  });
}

const csvUpload = extUpload({ maxMb: 5, exts: ['csv', 'xlsx', 'txt'], label: 'File peserta' });
const fontUpload = extUpload({ maxMb: 5, exts: ['ttf', 'otf', 'woff'], label: 'File font' });

module.exports = { templateUpload, signatureUpload, logoUpload, csvUpload, fontUpload };
