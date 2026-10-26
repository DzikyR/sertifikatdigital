const passport = require('passport');
const { Strategy: LocalStrategy } = require('passport-local');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');

const config = require('./index');
const prisma = require('./database');
const userService = require('../services/userService');
const audit = require('../services/auditService');
const featureService = require('../services/featureService');

const MESSAGES = {
  INVALID: 'Email atau password salah.',
  INACTIVE: 'Akun Anda dinonaktifkan. Hubungi Super Admin.',
  NOT_REGISTERED: 'Akun Google ini belum terdaftar. Hubungi Super Admin untuk didaftarkan.',
  PENDING: 'Akun Anda sedang menunggu persetujuan Super Admin.',
  REJECTED: 'Permintaan akses Anda ditolak. Hubungi Super Admin bila ini keliru.',
  REQUESTS_FULL: 'Antrean permintaan akses sedang penuh. Hubungi Super Admin.',
  DOMAIN: `Gunakan akun Google dengan domain @${config.google.allowedDomain}.`,
};

// ---------------------------------------------------------------------
// Local Strategy (email + password)
// ---------------------------------------------------------------------
passport.use(new LocalStrategy(
  { usernameField: 'email', passwordField: 'password', passReqToCallback: true },
  async (req, email, password, done) => {
    try {
      const { user, reason } = await userService.verifyCredentials(email, password);
      if (!user) {
        await audit.log({
          req, userId: null, action: 'LOGIN_FAILED', entity: 'User',
          meta: { email: userService.normalizeEmail(email), reason },
        });
        return done(null, false, { message: MESSAGES[reason] });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  },
));

// ---------------------------------------------------------------------
// Google OAuth 2.0
// - Email terdaftar & disetujui -> masuk (googleId ditautkan otomatis).
// - Email domain kampus (GOOGLE_ALLOWED_DOMAIN) yang belum terdaftar -> dibuat
//   PERMINTAAN AKSES (status PENDING), menunggu Super Admin menyetujui + memilih role.
// - Tanpa GOOGLE_ALLOWED_DOMAIN, permintaan akses dimatikan (siapa pun bisa punya akun
//   Google), sehingga hanya akun yang didaftarkan Super Admin yang bisa masuk.
// Info { status: 'PENDING' } membuat controller menampilkan halaman "menunggu persetujuan".
// ---------------------------------------------------------------------
if (config.google.enabled) {
  passport.use(new GoogleStrategy(
    {
      clientID: config.google.clientId,
      clientSecret: config.google.clientSecret,
      callbackURL: config.google.callbackUrl,
      passReqToCallback: true,
    },
    async (req, _accessToken, _refreshToken, profile, done) => {
      try {
        const primary = profile.emails?.find((e) => e.verified) || profile.emails?.[0];
        const email = userService.normalizeEmail(primary?.value);
        if (!email || primary?.verified === false) {
          return done(null, false, { message: 'Email Google belum terverifikasi.' });
        }

        if (config.google.allowedDomain && !email.endsWith(`@${config.google.allowedDomain}`)) {
          await audit.log({ req, userId: null, action: 'LOGIN_FAILED', meta: { email, reason: 'DOMAIN', via: 'google' } });
          return done(null, false, { message: MESSAGES.DOMAIN });
        }

        let user = await prisma.user.findFirst({
          where: { OR: [{ googleId: profile.id }, { email }] },
        });

        if (!user) {
          if (!config.google.allowedDomain || !featureService.isEnabled('auth.accessRequest')) {
            await audit.log({ req, userId: null, action: 'LOGIN_FAILED', meta: { email, reason: 'NOT_REGISTERED', via: 'google' } });
            return done(null, false, { message: MESSAGES.NOT_REGISTERED });
          }
          const created = await userService.createAccessRequest({
            email,
            name: profile.displayName || email.split('@')[0],
            googleId: profile.id,
            avatarUrl: profile.photos?.[0]?.value || null,
          });
          if (!created) return done(null, false, { message: MESSAGES.REQUESTS_FULL });
          await audit.log({ req, userId: created.id, action: 'ACCESS_REQUEST', entity: 'User', entityId: created.id, meta: { email } });
          return done(null, false, { status: 'PENDING', message: MESSAGES.PENDING });
        }
        if (user.approvalStatus === 'PENDING') return done(null, false, { status: 'PENDING', message: MESSAGES.PENDING });
        if (user.approvalStatus === 'REJECTED') return done(null, false, { message: MESSAGES.REJECTED });
        if (!user.isActive) return done(null, false, { message: MESSAGES.INACTIVE });

        if (!user.googleId || (!user.avatarUrl && profile.photos?.[0]?.value)) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              googleId: user.googleId || profile.id,
              avatarUrl: user.avatarUrl || profile.photos?.[0]?.value || null,
            },
          });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    },
  ));
}

// ---------------------------------------------------------------------
// Session serialization: simpan hanya ID; ambil ulang data aman tiap request
// sehingga perubahan role / nonaktif langsung berlaku.
// ---------------------------------------------------------------------
passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const user = await userService.findSafeById(id);
    if (!userService.canLogin(user)) return done(null, false);
    return done(null, user);
  } catch (err) {
    return done(err);
  }
});

module.exports = passport;
