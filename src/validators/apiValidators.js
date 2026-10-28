const { body, query, param } = require('express-validator');
const { CERT_FORMAT_REGEX } = require('../utils/format');

const EVENT_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PUBLISHED'];
const ROLES = ['SUPER_ADMIN', 'ADMIN', 'HMP'];
const EMAIL_STATUSES = ['PENDING', 'QUEUED', 'SENT', 'FAILED'];

const text = (field, max, label) => body(field).trim().isLength({ max }).withMessage(`${label} maksimal ${max} karakter.`);

const pagination = [
  query('page').optional().isInt({ min: 1, max: 100000 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('q').optional().trim().isLength({ max: 120 }),
];

const id = (name) => param(name).isString().isLength({ min: 10, max: 40 }).matches(/^[a-z0-9]+$/i).withMessage('ID tidak valid.');

// ---------------- Event ----------------
const eventFields = (optional) => {
  const req = (chain) => (optional ? chain.optional() : chain);
  return [
    req(body('title')).trim().notEmpty().withMessage('Nama kegiatan wajib diisi.').isLength({ max: 200 }).withMessage('Nama kegiatan maksimal 200 karakter.'),
    req(body('eventDate')).notEmpty().withMessage('Tanggal kegiatan wajib diisi.').isISO8601({ strict: true }).withMessage('Tanggal tidak valid (YYYY-MM-DD).').toDate(),
    text('theme', 250, 'Tema kegiatan').optional({ values: 'null' }), // '' = kosongkan (diubah ke null di controller)
    text('description', 5000, 'Deskripsi').optional({ values: 'null' }),
    text('location', 200, 'Lokasi').optional({ values: 'null' }),
    body('certNumberFormat').optional().trim().isLength({ min: 3, max: 100 })
      .matches(CERT_FORMAT_REGEX).withMessage('Format nomor wajib mengandung {SEQ} dan hanya huruf, angka, / - . _ serta token {YYYY} {MM} {ROMAN_MM} {EID} {SEQ:n}.'),
  ];
};

const listEvents = [
  ...pagination,
  query('status').optional().isIn(EVENT_STATUSES),
  query('organizerType').optional().isIn(['PRODI', 'HMP']),
];

const review = (required, label = 'Alasan penolakan') => [
  required
    ? body('note').trim().notEmpty().withMessage(`${label} wajib diisi.`).isLength({ max: 2000 })
    : body('note').optional().trim().isLength({ max: 2000 }),
];

// ---------------- Signature ----------------
const signatureFields = (optional) => [
  (optional ? body('label').optional() : body('label')).trim().notEmpty().withMessage('Label TTD wajib diisi (mis. "Kaprodi").').isLength({ max: 100 }),
  text('signerName', 150, 'Nama penandatangan').optional(),
  text('signerTitle', 150, 'Jabatan penandatangan').optional(),
  body('showSignerText').optional().isBoolean().toBoolean(),
];

const logoFields = [
  body('label').trim().notEmpty().withMessage('Nama logo wajib diisi (mis. "Logo TSU").').isLength({ max: 100 }).withMessage('Nama logo maksimal 100 karakter.'),
];

// ---------------- Participants ----------------
const listParticipants = [
  ...pagination,
  query('emailStatus').optional({ values: 'falsy' }).isIn(EMAIL_STATUSES),
  query('issueStatus').optional({ values: 'falsy' }).isIn(['issued', 'unissued', 'revoked', 'withdrawn']),
];

const issueIds = [
  body('ids').optional().isArray({ max: 2000 }),
  body('ids.*').optional().isString().isLength({ min: 10, max: 40 }).matches(/^[a-z0-9]+$/i).withMessage('ID peserta tidak valid.'),
];

const participantFields = [
  body('name').trim().notEmpty().withMessage('Nama peserta wajib diisi.').isLength({ max: 150 }).withMessage('Nama maksimal 150 karakter.'),
  body('email').trim().notEmpty().withMessage('Email wajib diisi.').isEmail().withMessage('Format email tidak valid.').isLength({ max: 191 }),
  text('role', 60, 'Peran').optional(),
  text('institution', 150, 'Instansi').optional(),
];

const bulkIds = [
  body('ids').isArray({ min: 1, max: 2000 }).withMessage('Pilih minimal satu peserta.'),
  body('ids.*').isString().isLength({ min: 10, max: 40 }).matches(/^[a-z0-9]+$/i).withMessage('ID peserta tidak valid.'),
];

const withdraw = [
  ...bulkIds,
  body('note').optional().trim().isLength({ max: 300 }).withMessage('Alasan maksimal 300 karakter.'),
];

const blast = [
  body('scope').optional().isIn(['pending', 'failed', 'all']),
  body('certificateIds').optional().isArray({ max: 500 }),
  body('certificateIds.*').optional().isString().isLength({ max: 40 }),
];

// ---------------- Admin: users ----------------
const password = (field = 'password') => body(field)
  .isLength({ min: 10, max: 128 }).withMessage('Password minimal 10 karakter.')
  .matches(/[A-Za-z]/).withMessage('Password harus mengandung huruf.')
  .matches(/\d/).withMessage('Password harus mengandung angka.');

const createUser = [
  body('name').trim().notEmpty().withMessage('Nama wajib diisi.').isLength({ max: 120 }),
  body('email').trim().isEmail().withMessage('Email tidak valid.').isLength({ max: 191 }),
  body('role').isIn(ROLES).withMessage('Role tidak valid.'),
  password().optional({ values: 'falsy' }),
];

const updateUser = [
  body('name').optional().trim().notEmpty().isLength({ max: 120 }),
  body('email').optional().trim().isEmail().withMessage('Email tidak valid.').isLength({ max: 191 }),
  body('role').optional().isIn(ROLES).withMessage('Role tidak valid.'),
  body('isActive').optional().isBoolean().toBoolean(),
];

const setFeature = [
  body('key').isString().isLength({ min: 3, max: 60 }).matches(/^[a-z.]+$/i),
  body('role').optional().isIn(['ADMIN', 'HMP', 'GLOBAL']),
  body('enabled').isBoolean().withMessage('Nilai enabled harus boolean.').toBoolean(),
];

const approveRequest = [
  body('role').isIn(['ADMIN', 'HMP', 'SUPER_ADMIN']).withMessage('Pilih role untuk user ini.'),
];

const listUsers = [
  ...pagination,
  query('role').optional().isIn(ROLES),
  query('isActive').optional().isBoolean().toBoolean(),
];

const listLogs = [
  ...pagination,
  query('action').optional().trim().isLength({ max: 80 }),
  query('userId').optional().isString().isLength({ max: 40 }),
  query('from').optional().isISO8601().toDate(),
  query('to').optional().isISO8601().toDate(),
];

// ---------------- Public ----------------
const publicSearch = [
  query('q').trim().notEmpty().withMessage('Masukkan email atau nomor sertifikat.')
    .isLength({ min: 5, max: 191 }).withMessage('Input pencarian tidak valid.'),
];

module.exports = {
  id, pagination, eventFields, listEvents, review, signatureFields, logoFields, listParticipants, participantFields, bulkIds, issueIds, withdraw, blast,
  password, createUser, updateUser, approveRequest, setFeature, listUsers, listLogs, publicSearch,
};
