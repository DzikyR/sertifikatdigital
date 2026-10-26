const { body } = require('express-validator');

const login = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email wajib diisi.')
    .isEmail().withMessage('Format email tidak valid.')
    .isLength({ max: 191 })
    .normalizeEmail({ gmail_remove_dots: false }),
  body('password')
    .notEmpty().withMessage('Password wajib diisi.')
    .isLength({ max: 128 }).withMessage('Password terlalu panjang.'),
];

module.exports = { login };
