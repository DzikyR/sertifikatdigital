const { validationResult, matchedData } = require('express-validator');
const { back } = require('../utils/safeRedirect');
const { wantsJson } = require('../utils/http');

/**
 * Jalankan setelah rangkaian validator express-validator.
 * - Request JSON  -> 422 + daftar error
 * - Request form  -> flash error + redirect kembali (input lama disimpan)
 * Data tervalidasi tersedia di req.validated.
 */
function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) {
    req.validated = matchedData(req, { locations: ['body', 'query', 'params'] });
    return next();
  }

  const errors = result.array({ onlyFirstError: true }).map((e) => ({ field: e.path, message: e.msg }));

  if (wantsJson(req)) {
    return res.status(422).json({ success: false, errors });
  }

  errors.forEach((e) => req.flash('error', e.message));
  const { password, _csrf, ...oldInput } = req.body || {};
  req.flash('oldInput', JSON.stringify(oldInput));
  return res.redirect(back(req, req.originalUrl));
}

module.exports = validate;
