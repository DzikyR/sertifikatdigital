const passport = require('../config/passport');
const config = require('../config');
const featureService = require('../services/featureService');

const googleOn = () => config.google.enabled && featureService.isEnabled('auth.google');
const userService = require('../services/userService');
const audit = require('../services/auditService');
const { safePath } = require('../utils/safeRedirect');

exports.showLogin = (req, res) => {
  res.render('pages/auth/login', {
    title: 'Masuk',
    googleEnabled: googleOn(),
  });
};

// Dipanggil setelah strategy (local/google) berhasil memverifikasi user
function completeLogin(req, res, next, user, via) {
  // returnTo dibaca SEBELUM req.login karena Passport me-regenerate session (anti session fixation)
  const returnTo = safePath(req.session.returnTo, req, '/dashboard');

  req.login(user, async (err) => {
    if (err) return next(err);
    await Promise.all([
      userService.touchLastLogin(user.id),
      audit.log({ req, userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id, meta: { via } }),
    ]);
    req.flash('success', `Selamat datang, ${user.name}!`);
    return res.redirect(returnTo);
  });
}

function authenticateWith(strategy) {
  return (req, res, next) => {
    passport.authenticate(strategy, (err, user, info) => {
      if (err) return next(err);
      if (!user && info?.status === 'PENDING') return res.redirect('/auth/pending');
      if (!user) {
        req.flash('error', info?.message || 'Login gagal.');
        if (strategy === 'local') req.flash('oldInput', JSON.stringify({ email: req.body?.email || '' }));
        return res.redirect('/auth/login');
      }
      return completeLogin(req, res, next, user, strategy);
    })(req, res, next);
  };
}

exports.login = authenticateWith('local');

exports.pending = (req, res) => {
  res.render('pages/auth/pending', { title: 'Menunggu Persetujuan' });
};

exports.googleRedirect = (req, res, next) => {
  if (!googleOn()) {
    req.flash('error', config.google.enabled ? 'Login Google sedang dinonaktifkan. Gunakan email & password.' : 'Login Google belum dikonfigurasi.');
    return res.redirect('/auth/login');
  }
  return passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' })(req, res, next);
};

exports.googleCallback = (req, res, next) => {
  if (!googleOn()) return res.redirect('/auth/login');
  return authenticateWith('google')(req, res, next);
};

exports.logout = (req, res, next) => {
  const userId = req.user?.id;
  req.logout((err) => {
    if (err) return next(err);
    audit.log({ req, userId, action: 'LOGOUT', entity: 'User', entityId: userId });
    req.session.destroy(() => {
      res.clearCookie('sid');
      res.redirect('/auth/login?logout=1');
    });
  });
};
