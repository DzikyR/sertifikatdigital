const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { hashPassword, normalizeEmail, SAFE_SELECT } = require('./userService');

const USER_SELECT = {
  ...SAFE_SELECT, googleId: true, lastLoginAt: true, createdAt: true, passwordHash: true, requestedAt: true, reviewedAt: true,
};

// Jangan kirim hash ke klien; cukup info apakah akun punya password lokal / tertaut Google
const serialize = ({ passwordHash, googleId, ...u }) => ({ ...u, hasPassword: Boolean(passwordHash), googleLinked: Boolean(googleId) });

// Daftar user utama hanya akun yang sudah disetujui; permintaan akses ditampilkan terpisah
async function listUsers({ q, role, isActive, approvalStatus = 'APPROVED', page = 1, pageSize = 20 }) {
  const where = { approvalStatus };
  if (role) where.role = role;
  if (typeof isActive === 'boolean') where.isActive = isActive;
  if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }];

  const [total, items] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, select: USER_SELECT, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { items: items.map(serialize), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

async function createUser({ name, email, role, password }) {
  try {
    const user = await prisma.user.create({
      data: {
        name,
        email: normalizeEmail(email),
        role,
        passwordHash: password ? await hashPassword(password) : null, // kosong = hanya login Google
      },
      select: USER_SELECT,
    });
    return serialize(user);
  } catch (err) {
    if (err.code === 'P2002') {
      const existing = await prisma.user.findUnique({ where: { email: normalizeEmail(email) }, select: { approvalStatus: true } });
      if (existing?.approvalStatus === 'PENDING') throw new AppError('Email ini sedang mengajukan akses. Setujui dari daftar Permintaan Akses.', 409);
      if (existing?.approvalStatus === 'REJECTED') throw new AppError('Email ini pernah ditolak. Setujui ulang dari daftar Permintaan Ditolak.', 409);
      throw new AppError('Email sudah terdaftar.', 409);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------
// Permintaan akses (login Google pertama dari domain kampus)
// ---------------------------------------------------------------------
async function listAccessRequests() {
  const [pending, rejected] = await Promise.all([
    prisma.user.findMany({ where: { approvalStatus: 'PENDING' }, select: USER_SELECT, orderBy: { requestedAt: 'asc' } }),
    prisma.user.findMany({ where: { approvalStatus: 'REJECTED' }, select: USER_SELECT, orderBy: { reviewedAt: 'desc' }, take: 20 }),
  ]);
  return { pending: pending.map(serialize), rejected: rejected.map(serialize) };
}

const countPendingRequests = () => prisma.user.count({ where: { approvalStatus: 'PENDING' } });

async function findRequest(id, allowed) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || !allowed.includes(user.approvalStatus)) throw new AppError('Permintaan akses tidak ditemukan atau sudah diproses.', 404);
  return user;
}

/** Setujui permintaan (PENDING atau yang pernah ditolak) sekaligus menetapkan role. */
async function approveRequest(id, role) {
  await findRequest(id, ['PENDING', 'REJECTED']);
  const user = await prisma.user.update({
    where: { id },
    data: { approvalStatus: 'APPROVED', role, isActive: true, reviewedAt: new Date() },
    select: USER_SELECT,
  });
  return serialize(user);
}

async function rejectRequest(id) {
  await findRequest(id, ['PENDING']);
  const user = await prisma.user.update({
    where: { id },
    data: { approvalStatus: 'REJECTED', reviewedAt: new Date() },
    select: USER_SELECT,
  });
  return serialize(user);
}

/** Hapus permintaan yang ditolak agar email tersebut bisa mengajukan ulang. */
async function deleteRequest(id) {
  await findRequest(id, ['PENDING', 'REJECTED']);
  await prisma.user.delete({ where: { id } });
}

async function updateUser(actor, id, { name, email, role, isActive }) {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new AppError('User tidak ditemukan.', 404);
  if (target.approvalStatus !== 'APPROVED') throw new AppError('Proses akun ini lewat daftar Permintaan Akses.', 422);

  if (actor.id === id && ((role && role !== target.role) || isActive === false)) {
    throw new AppError('Anda tidak dapat mengubah role atau menonaktifkan akun sendiri.', 422);
  }
  // Cegah sistem kehilangan Super Admin aktif terakhir
  const demotingSuperAdmin = target.role === 'SUPER_ADMIN' && ((role && role !== 'SUPER_ADMIN') || isActive === false);
  if (demotingSuperAdmin) {
    const others = await prisma.user.count({ where: { role: 'SUPER_ADMIN', isActive: true, id: { not: id } } });
    if (others === 0) throw new AppError('Minimal harus ada satu Super Admin aktif.', 422);
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email: normalizeEmail(email) }),
        ...(role !== undefined && { role }),
        ...(isActive !== undefined && { isActive }),
      },
      select: USER_SELECT,
    });
    // User dinonaktifkan -> hapus semua session aktifnya
    if (isActive === false) await revokeSessions(id);
    return serialize(user);
  } catch (err) {
    if (err.code === 'P2002') throw new AppError('Email sudah dipakai user lain.', 409);
    throw err;
  }
}

async function resetPassword(id, password) {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new AppError('User tidak ditemukan.', 404);
  await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password) } });
  await revokeSessions(id);
}

// Session tersimpan di tabel `session` (connect-pg-simple) dengan struktur sess.passport.user = id
function revokeSessions(userId) {
  return prisma.$executeRaw`DELETE FROM "session" WHERE sess->'passport'->>'user' = ${userId}`;
}

async function listLogs({ action, userId, from, to, page = 1, pageSize = 50 }) {
  const where = {};
  if (action) where.action = action;
  if (userId) where.userId = userId;
  if (from || to) {
    // `to` dari input tanggal = awal hari -> sertakan seluruh hari tersebut
    const end = to && new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1);
    where.createdAt = { ...(from && { gte: from }), ...(end && { lte: end }) };
  }

  const [total, items, actions] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    }),
    prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
  ]);
  return { items, actions: actions.map((a) => a.action), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

module.exports = {
  listUsers, createUser, updateUser, resetPassword, listLogs,
  listAccessRequests, countPendingRequests, approveRequest, rejectRequest, deleteRequest,
};
