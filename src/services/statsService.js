const prisma = require('../config/database');
const { ROLES } = require('../utils/constants');

const toMap = (rows, key) => Object.fromEntries(rows.map((r) => [r[key], r._count]));

/**
 * Statistik dashboard.
 * - ADMIN (Kaprodi/Admin Prodi): seluruh kegiatan Prodi & HMP.
 * - HMP: hanya kegiatan HMP.
 * - SUPER_ADMIN: seluruh data + statistik user & aktivitas sistem.
 */
async function dashboard(user) {
  const eventWhere = user.role === ROLES.HMP ? { organizerType: 'HMP' } : {};
  const certWhere = user.role === ROLES.HMP ? { event: { organizerType: 'HMP' } } : {};
  // Rentang 12 bulan: 9 bulan lalu s.d. 2 bulan ke depan (event sering dibuat sebelum kegiatan)
  const since = new Date();
  since.setMonth(since.getMonth() - 9, 1);
  since.setHours(0, 0, 0, 0);
  const until = new Date(since);
  until.setMonth(since.getMonth() + 12);

  const [eventsByStatus, eventsByOrganizer, certTotal, certIssued, emailByStatus, downloads, pendingApprovals, recentEvents, monthlyEvents] = await Promise.all([
    prisma.event.groupBy({ by: ['status'], where: eventWhere, _count: true }),
    prisma.event.groupBy({ by: ['organizerType'], where: eventWhere, _count: true }),
    prisma.certificate.count({ where: certWhere }),
    prisma.certificate.count({ where: { ...certWhere, issuedAt: { not: null } } }),
    prisma.certificate.groupBy({ by: ['emailStatus'], where: { ...certWhere, issuedAt: { not: null } }, _count: true }),
    prisma.certificate.aggregate({ where: certWhere, _sum: { downloadCount: true } }),
    prisma.event.count({ where: { ...eventWhere, status: 'PENDING_APPROVAL' } }),
    prisma.event.findMany({
      where: eventWhere,
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, title: true, status: true, organizerType: true, eventDate: true, updatedAt: true, _count: { select: { certificates: true } } },
    }),
    prisma.event.findMany({ where: { ...eventWhere, eventDate: { gte: since, lt: until } }, select: { eventDate: true, organizerType: true } }),
  ]);

  // Agregasi 12 bulan terakhir per penyelenggara
  const months = [];
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(since);
    d.setMonth(since.getMonth() + i);
    months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, PRODI: 0, HMP: 0 });
  }
  monthlyEvents.forEach((e) => {
    const d = new Date(e.eventDate);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const m = months.find((x) => x.key === key);
    if (m) m[e.organizerType] += 1;
  });

  const result = {
    events: { byStatus: toMap(eventsByStatus, 'status'), byOrganizer: toMap(eventsByOrganizer, 'organizerType'), pendingApprovals },
    certificates: { total: certTotal, issued: certIssued, email: toMap(emailByStatus, 'emailStatus'), downloads: downloads._sum.downloadCount || 0 },
    monthly: months,
    recentEvents,
  };

  if (user.role === ROLES.SUPER_ADMIN) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [usersByRole, inactiveUsers, failedLogins24h] = await Promise.all([
      prisma.user.groupBy({ by: ['role'], where: { approvalStatus: 'APPROVED' }, _count: true }),
      prisma.user.count({ where: { isActive: false, approvalStatus: 'APPROVED' } }),
      prisma.auditLog.count({ where: { action: 'LOGIN_FAILED', createdAt: { gte: dayAgo } } }),
    ]);
    result.system = { usersByRole: toMap(usersByRole, 'role'), inactiveUsers, failedLogins24h };
  }

  return result;
}

module.exports = { dashboard };
