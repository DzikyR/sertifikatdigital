const prisma = require('../config/database');
const pdfService = require('./pdfService');
const mailService = require('./mailService');
const audit = require('./auditService');

/**
 * Antrean blast email in-process (cukup untuk skala prodi).
 * - Satu event hanya diproses oleh satu worker sekaligus.
 * - Status per sertifikat disimpan di DB (QUEUED → SENT / FAILED), sehingga progres bisa
 *   dipantau dan blast yang terputus (server restart) bisa dilanjutkan dengan `start()` lagi.
 */
const CONCURRENCY = 3;
const running = new Map(); // eventId -> { total, processed, sent, failed, startedAt }

const isRunning = (eventId) => running.has(eventId);
const progress = (eventId) => running.get(eventId) || null;

/**
 * Mulai blast untuk event yang sudah terbit.
 * @param {'pending'|'failed'|'all'} scope pending = belum pernah terkirim (PENDING/QUEUED/FAILED)
 */
async function start(event, { scope = 'pending', certificateIds, actorId } = {}) {
  if (running.has(event.id)) return { started: false, reason: 'Blast untuk event ini sedang berjalan.', progress: progress(event.id) };

  const where = { eventId: event.id, status: 'ACTIVE', issuedAt: { not: null } };
  if (certificateIds?.length) where.id = { in: certificateIds };
  else if (scope === 'failed') where.emailStatus = 'FAILED';
  else if (scope === 'pending') where.emailStatus = { in: ['PENDING', 'QUEUED', 'FAILED'] };

  const { count } = await prisma.certificate.updateMany({ where, data: { emailStatus: 'QUEUED', emailError: null } });
  if (count === 0) return { started: false, reason: 'Tidak ada sertifikat yang perlu dikirim.' };

  const state = { total: count, processed: 0, sent: 0, failed: 0, startedAt: new Date() };
  running.set(event.id, state);

  // Jalan di background; request HTTP langsung dibalas 202
  setImmediate(() => {
    worker(event, state, actorId)
      .catch((err) => console.error('[blast] worker error:', err))
      .finally(() => running.delete(event.id));
  });

  return { started: true, progress: state };
}

async function worker(event, state, actorId) {
  const assets = await pdfService.loadAssets(event);

  const queue = await prisma.certificate.findMany({
    where: { eventId: event.id, emailStatus: 'QUEUED' },
    orderBy: { certificateNumber: 'asc' },
  });

  const next = async () => {
    while (queue.length) {
      const cert = queue.shift();
      try {
        const pdf = await pdfService.getCertificatePdf(cert, event, assets);
        await mailService.sendCertificate(cert, event, pdf);
        await prisma.certificate.update({
          where: { id: cert.id },
          data: { emailStatus: 'SENT', emailSentAt: new Date(), emailError: null },
        });
        state.sent += 1;
      } catch (err) {
        await prisma.certificate.update({
          where: { id: cert.id },
          data: { emailStatus: 'FAILED', emailError: String(err.message).slice(0, 1000) },
        });
        state.failed += 1;
      } finally {
        state.processed += 1;
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, next));

  await audit.log({
    userId: actorId ?? null,
    action: 'CERT_BLAST_DONE',
    entity: 'Event',
    entityId: event.id,
    meta: { total: state.total, sent: state.sent, failed: state.failed },
  });
}

module.exports = { start, isRunning, progress };
