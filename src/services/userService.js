const bcrypt = require('bcryptjs');
const prisma = require('../config/database');

const SALT_ROUNDS = 12;

// Field yang aman dibawa ke session / view (tanpa passwordHash)
const SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  avatarUrl: true,
  isActive: true,
  approvalStatus: true,
};

/** Hanya akun aktif yang sudah disetujui Super Admin yang boleh memakai sistem. */
const canLogin = (user) => Boolean(user?.isActive && user.approvalStatus === 'APPROVED');

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const hashPassword = (plain) => bcrypt.hash(plain, SALT_ROUNDS);

function findByEmail(email) {
  return prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
}

function findSafeById(id) {
  return prisma.user.findUnique({ where: { id }, select: SAFE_SELECT });
}

// Hash dummy agar waktu respons sama saat email tidak terdaftar (anti user-enumeration)
const DUMMY_HASH = bcrypt.hashSync('dummy-password-tidak-dipakai', SALT_ROUNDS);

async function verifyCredentials(email, password) {
  const user = await findByEmail(email);
  const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
  if (!user || !user.passwordHash || !ok) return { user: null, reason: 'INVALID' };
  if (user.approvalStatus !== 'APPROVED') return { user: null, reason: user.approvalStatus };
  if (!user.isActive) return { user: null, reason: 'INACTIVE' };
  return { user, reason: null };
}

// Batas antrean agar daftar permintaan tidak bisa dibanjiri
const MAX_PENDING_REQUESTS = 100;

/**
 * Buat permintaan akses dari login Google pertama (status PENDING, belum bisa login).
 * Role sementara HMP; Super Admin menentukan role final saat menyetujui.
 * Mengembalikan null jika antrean penuh.
 */
async function createAccessRequest({ email, name, googleId, avatarUrl }) {
  const pending = await prisma.user.count({ where: { approvalStatus: 'PENDING' } });
  if (pending >= MAX_PENDING_REQUESTS) return null;
  // Dua login bersamaan dari email yang sama -> pakai record yang sudah tercipta
  return prisma.user.create({
    data: {
      email: normalizeEmail(email),
      name: String(name).slice(0, 120),
      googleId,
      avatarUrl,
      role: 'HMP',
      approvalStatus: 'PENDING',
      requestedAt: new Date(),
    },
  }).catch((err) => {
    if (err.code === 'P2002') return findByEmail(email);
    throw err;
  });
}

function touchLastLogin(id) {
  return prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
}

module.exports = {
  SAFE_SELECT,
  canLogin,
  normalizeEmail,
  hashPassword,
  findByEmail,
  findSafeById,
  verifyCredentials,
  createAccessRequest,
  touchLastLogin,
};
