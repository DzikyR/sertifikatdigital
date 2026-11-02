const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { EVENT_STATUS: S } = require('../utils/constants');
const { formatCertNumber, eventCode } = require('../utils/format');
const { signCertificate } = require('../utils/certCrypto');
const { can } = require('./eventPolicy');

/**
 * Penomoran sertifikat, termasuk event yang saling terhubung (NumberingGroup).
 *
 * - Event tanpa grup memakai counter sendiri (Event.certNumberSeq).
 * - Event dalam grup memakai satu counter bersama (NumberingGroup.lastSeq) dan satu kode {EID}
 *   (NumberingGroup.code), sehingga nomor Event B melanjutkan nomor terakhir Event A.
 *
 * Semua perubahan penomoran berjalan di dalam `withNumberingLock`: transaksi yang memegang advisory
 * lock PostgreSQL. Dua proses yang menomori bersamaan menjadi antre, tidak mungkin membaca counter
 * yang sama. Kunci dilepas otomatis saat transaksi commit/rollback. Unique constraint pada
 * Certificate.certificateNumber tetap menjadi pengaman terakhir.
 */

const NUMBERING_LOCK_KEY = 7385102; // angka bebas, hanya perlu konsisten di seluruh aplikasi
const EDITABLE = [S.DRAFT, S.REJECTED];
const CERT_ORDER = [{ seqNo: 'asc' }, { certificateNumber: 'asc' }];

function withNumberingLock(fn) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${NUMBERING_LOCK_KEY}::bigint)`;
    return fn(tx);
  }, { maxWait: 60000, timeout: 120000 });
}

const codeOf = (event, group) => group?.code || eventCode(event.id);

const buildNumber = (event, group, seq) => formatCertNumber(event.certNumberFormat, {
  eventDate: event.eventDate, code: codeOf(event, group), seq,
});

const loadEvent = (tx, eventId) => tx.event.findUnique({ where: { id: eventId }, include: { numberingGroup: true } });

/** Cadangkan `count` nomor urut berturut-turut. Wajib dipanggil di dalam withNumberingLock. */
async function reserve(tx, eventId, count) {
  const event = await loadEvent(tx, eventId);
  const group = event.numberingGroup;
  const last = group
    ? (await tx.numberingGroup.update({ where: { id: group.id }, data: { lastSeq: { increment: count } } })).lastSeq
    : (await tx.event.update({ where: { id: eventId }, data: { certNumberSeq: { increment: count } } })).certNumberSeq;
  return { event, group, start: last - count + 1 };
}

/**
 * Tulis nomor baru. Dua tahap (nomor sementara dulu) agar tidak melanggar unique constraint saat
 * nomor lama dan baru saling bertukar. HMAC dihitung ulang karena nomor termasuk data yang ditandatangani.
 */
async function applyNumbers(tx, event, group, certs, seqOf) {
  for (const c of certs) {
    await tx.certificate.update({ where: { id: c.id }, data: { certificateNumber: `tmp-${c.id}` } });
  }
  for (const [i, c] of certs.entries()) {
    const seqNo = seqOf(c, i);
    const certificateNumber = buildNumber(event, group, seqNo);
    await tx.certificate.update({
      where: { id: c.id },
      data: { seqNo, certificateNumber, signatureHash: signCertificate({ ...c, certificateNumber }) },
    });
  }
}

/**
 * Rapikan grup setelah anggota/sertifikatnya berkurang: counter kembali ke nomor tertinggi yang masih
 * dipakai, sehingga nomor tidak meloncat saat peserta diimpor ulang. Grup kosong dihapus. Bila hanya
 * tersisa event acuan, grup dibubarkan: kodenya sama dengan {EID} event itu, jadi nomornya tidak berubah.
 */
async function settleGroup(tx, groupId) {
  const group = await tx.numberingGroup.findUnique({ where: { id: groupId } });
  if (!group) return;
  const members = await tx.event.findMany({ where: { numberingGroupId: groupId }, select: { id: true } });
  if (!members.length) {
    await tx.numberingGroup.delete({ where: { id: groupId } });
    return;
  }
  const { _max } = await tx.certificate.aggregate({ where: { event: { numberingGroupId: groupId } }, _max: { seqNo: true } });
  const last = _max.seqNo || 0;
  if (members.length === 1 && eventCode(members[0].id) === group.code) {
    await tx.event.update({ where: { id: members[0].id }, data: { numberingGroupId: null, certNumberSeq: last } });
    await tx.numberingGroup.delete({ where: { id: groupId } });
    return;
  }
  await tx.numberingGroup.update({ where: { id: groupId }, data: { lastSeq: last } });
}

const conflict = (err, message) => (err.code === 'P2002' ? new AppError(message, 409) : err);

/**
 * Hubungkan `event` ke `targetEventId`: nomor event ini melanjutkan nomor terakhir grup.
 * Nomor event tujuan tidak berubah, jadi tujuan boleh sudah terbit. Event ini mengikuti format nomor
 * tujuan dan, bila sudah punya peserta, dinomori ulang (hanya boleh selama masih bisa diedit).
 */
async function link(event, targetEventId, user) {
  try {
    return await withNumberingLock(async (tx) => {
      if (targetEventId === event.id) throw new AppError('Event tidak dapat dihubungkan ke dirinya sendiri.', 422);
      const source = await loadEvent(tx, event.id);
      const target = await loadEvent(tx, targetEventId);
      if (!target || !can('view', user, target)) throw new AppError('Event tujuan tidak ditemukan.', 404);
      if (target.organizerType !== source.organizerType) throw new AppError('Hanya event dengan penyelenggara yang sama yang dapat dihubungkan.', 422);
      if (!EDITABLE.includes(source.status)) throw new AppError('Penomoran hanya dapat diubah saat event masih bisa diedit.', 409);
      if (source.numberingGroupId) throw new AppError('Event ini sudah terhubung. Lepaskan dulu sebelum menghubungkan ke event lain.', 409);

      let group = target.numberingGroup;
      if (!group) {
        group = await tx.numberingGroup.create({
          data: { name: target.title, code: eventCode(target.id), lastSeq: target.certNumberSeq },
        });
        await tx.event.update({ where: { id: target.id }, data: { numberingGroupId: group.id } });
      }

      const certs = await tx.certificate.findMany({ where: { eventId: source.id }, orderBy: CERT_ORDER });
      const updated = await tx.event.update({
        where: { id: source.id },
        data: { numberingGroupId: group.id, certNumberFormat: target.certNumberFormat, certNumberSeq: 0 },
      });
      const base = group.lastSeq;
      await applyNumbers(tx, updated, group, certs, (_c, i) => base + i + 1);
      await tx.numberingGroup.update({ where: { id: group.id }, data: { lastSeq: base + certs.length } });
      return { groupId: group.id, renumbered: certs.length, nextSeq: base + certs.length + 1 };
    });
  } catch (err) {
    throw conflict(err, 'Nomor hasil penghubungan bentrok dengan event di luar grup. Ubah format nomor event yang bentrok.');
  }
}

/** Lepaskan event dari grup: kembali memakai counter & {EID} sendiri, mulai dari 1. */
async function unlink(event) {
  try {
    return await withNumberingLock(async (tx) => {
      const source = await loadEvent(tx, event.id);
      const group = source.numberingGroup;
      if (!group) throw new AppError('Event ini tidak terhubung ke event lain.', 422);
      if (!EDITABLE.includes(source.status)) throw new AppError('Penomoran hanya dapat diubah saat event masih bisa diedit.', 409);

      const others = await tx.event.count({ where: { numberingGroupId: group.id, id: { not: source.id } } });
      if (others && eventCode(source.id) === group.code) {
        throw new AppError('Ini event acuan grup. Lepaskan dulu event lain yang terhubung dengannya.', 409);
      }

      const certs = await tx.certificate.findMany({ where: { eventId: source.id }, orderBy: CERT_ORDER });
      const updated = await tx.event.update({
        where: { id: source.id },
        data: { numberingGroupId: null, certNumberSeq: certs.length },
      });
      await applyNumbers(tx, updated, null, certs, (_c, i) => i + 1);
      await settleGroup(tx, group.id);
      return { renumbered: certs.length };
    });
  } catch (err) {
    throw conflict(err, 'Setelah dilepas, nomor event ini akan bentrok dengan event lain. Ubah dulu format nomornya, lalu lepaskan lagi.');
  }
}

/**
 * Terapkan ulang format/tanggal ke sertifikat event. Dalam grup nomor urutnya dipertahankan, karena
 * event lain sudah memakai nomor di sekitarnya; tanpa grup dinomori rapat dari 1.
 */
async function renumber(eventRef) {
  try {
    await withNumberingLock(async (tx) => {
      const event = await loadEvent(tx, eventRef.id);
      const group = event.numberingGroup;
      const certs = await tx.certificate.findMany({ where: { eventId: event.id }, orderBy: CERT_ORDER });
      await applyNumbers(tx, event, group, certs, group ? (c) => c.seqNo : (_c, i) => i + 1);
      if (!group) await tx.event.update({ where: { id: event.id }, data: { certNumberSeq: certs.length } });
    });
  } catch (err) {
    throw conflict(err, 'Format nomor menghasilkan nomor yang bentrok dengan event lain.');
  }
}

/** Hapus semua peserta event, lalu kembalikan counter yang relevan. */
function clearCertificates(eventId) {
  return withNumberingLock(async (tx) => {
    const event = await loadEvent(tx, eventId);
    await tx.certificate.deleteMany({ where: { eventId } });
    if (event.numberingGroupId) await settleGroup(tx, event.numberingGroupId);
    else await tx.event.update({ where: { id: eventId }, data: { certNumberSeq: 0 } });
  });
}

/** Hapus event (cascade ke sertifikat), lalu rapikan grupnya. */
function deleteEvent(eventId) {
  return withNumberingLock(async (tx) => {
    const { numberingGroupId } = await tx.event.findUnique({ where: { id: eventId }, select: { numberingGroupId: true } });
    await tx.event.delete({ where: { id: eventId } });
    if (numberingGroupId) await settleGroup(tx, numberingGroupId);
  });
}

/** Data panel "Penomoran Terhubung" di tab Info Event. */
async function panel(user, event) {
  const fresh = await loadEvent(prisma, event.id);
  const group = fresh.numberingGroup;
  const base = { nextSeq: (group ? group.lastSeq : fresh.certNumberSeq) + 1, group, members: [], candidates: [], isAnchor: false };

  if (group) {
    const members = await prisma.event.findMany({
      where: { numberingGroupId: group.id }, orderBy: { createdAt: 'asc' }, select: { id: true, title: true },
    });
    const ranges = await prisma.certificate.groupBy({
      by: ['eventId'], where: { eventId: { in: members.map((m) => m.id) } }, _count: true, _min: { seqNo: true }, _max: { seqNo: true },
    });
    const byEvent = new Map(ranges.map((r) => [r.eventId, r]));
    return {
      ...base,
      isAnchor: eventCode(fresh.id) === group.code,
      members: members.map((m) => ({
        ...m,
        count: byEvent.get(m.id)?._count || 0,
        first: byEvent.get(m.id)?._min.seqNo ?? null,
        last: byEvent.get(m.id)?._max.seqNo ?? null,
      })),
    };
  }

  if (!can('linkNumbering', user, fresh)) return base;
  const candidates = await prisma.event.findMany({
    where: { id: { not: fresh.id }, organizerType: fresh.organizerType },
    orderBy: { updatedAt: 'desc' },
    take: 200,
    select: { id: true, title: true, certNumberSeq: true, certNumberFormat: true, numberingGroup: { select: { lastSeq: true } } },
  });
  return {
    ...base,
    candidates: candidates.map((c) => ({
      id: c.id, title: c.title, format: c.certNumberFormat, nextSeq: (c.numberingGroup ? c.numberingGroup.lastSeq : c.certNumberSeq) + 1,
    })),
  };
}

module.exports = {
  withNumberingLock, reserve, buildNumber, link, unlink, renumber, clearCertificates, deleteEvent, panel,
};
