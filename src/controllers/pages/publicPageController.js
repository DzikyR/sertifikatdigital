const publicService = require('../../services/publicService');

exports.search = async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 191);
  let results = null;
  let error = null;
  if (q) {
    if (q.length < 5) error = 'Masukkan email lengkap atau nomor sertifikat.';
    else results = await publicService.search(q);
  }
  res.set('Cache-Control', 'no-store');
  res.render('pages/public/search', { title: 'Cari Sertifikat', q, results, error });
};

exports.verifyForm = (req, res) => {
  // Terima input kode atau URL lengkap hasil scan QR
  const raw = String(req.query.code || '').trim();
  if (raw) {
    const code = raw.split('/verify/').pop().split(/[?#]/)[0];
    return res.redirect(`/verify/${encodeURIComponent(code)}`);
  }
  return res.render('pages/public/verify', { title: 'Verifikasi Sertifikat', result: null, code: '' });
};

exports.verify = async (req, res) => {
  const result = await publicService.verify(req.params.code);
  res.set('Cache-Control', 'no-store');
  res.status(result.reason === 'NOT_FOUND' ? 404 : 200);
  res.render('pages/public/verify', {
    title: result.valid ? 'Sertifikat Valid' : 'Verifikasi Sertifikat',
    result,
    code: req.params.code,
  });
};
