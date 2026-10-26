const prisma = require('../config/database');

/**
 * Catat aktivitas ke AuditLog. Tidak pernah melempar error agar
 * kegagalan logging tidak menggagalkan request utama.
 */
async function log({ req, userId, action, entity, entityId, meta }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId ?? req?.user?.id ?? null,
        action,
        entity: entity ?? null,
        entityId: entityId ?? null,
        meta: meta ?? undefined,
        ip: req?.ip ?? null,
        userAgent: req?.get?.('user-agent')?.slice(0, 255) ?? null,
      },
    });
  } catch (err) {
    console.error('[audit] gagal mencatat log:', err.message);
  }
}

module.exports = { log };
