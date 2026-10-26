const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const int = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
};

const WEAK_SECRETS = ['ganti-dengan-string-acak-panjang', 'ganti-dengan-string-acak-panjang-lain'];

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Environment variable ${name} wajib diisi (lihat .env.example)`);
  if (process.env.NODE_ENV === 'production' && WEAK_SECRETS.includes(value)) {
    throw new Error(`${name} masih memakai nilai contoh. Ganti dengan string acak sebelum production.`);
  }
  return value;
}

const rootDir = path.resolve(__dirname, '../..');

const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: int(process.env.PORT, 3000),
  appName: process.env.APP_NAME || 'SertifDigital Informatika TSU',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  trustProxy: int(process.env.TRUST_PROXY, 0),

  databaseUrl: required('DATABASE_URL'),
  sessionSecret: required('SESSION_SECRET'),
  qrSigningSecret: required('QR_SIGNING_SECRET'),

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
    allowedDomain: (process.env.GOOGLE_ALLOWED_DOMAIN || '').trim().toLowerCase(),
    get enabled() {
      return Boolean(this.clientId && this.clientSecret);
    },
  },

  paths: {
    root: rootDir,
    views: path.join(rootDir, 'src/views'),
    public: path.join(rootDir, 'public'),
    // storage/ sengaja di luar public/ -> file hanya bisa diakses lewat route terkontrol
    storage: path.join(rootDir, 'storage'),
    uploads: path.join(rootDir, 'storage/uploads'),
    certificates: path.join(rootDir, 'storage/certificates'),
  },

  rateLimit: {
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MIN, 15) * 60 * 1000,
    max: int(process.env.RATE_LIMIT_MAX, 300),
    publicMax: int(process.env.PUBLIC_RATE_LIMIT_MAX, 30),
  },
};

module.exports = config;
