const sharp = require('sharp');
const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const storage = require('../utils/storage');
const { ROLES, EVENT_STATUS: S } = require('../utils/constants');
const { defaultLayout } = require('./layoutService');
const { permissionsFor } = require('./eventPolicy');

const MAX_TEMPLATE_SIDE = 4000; // px; template lebih besar diperkecil agar PDF tetap ringan
const MIN_TEMPLATE_SIDE = 600;

const userBrief = { select: { id: true, name: true, email: true } };

// ---------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------
async function list(user, { status, organizerType, q, page = 1, pageSize = 20 }) {
  const where = {};
  if (user.role === ROLES.HMP) where.organizerType = 'HMP';
  else if (organizerType) where.organizerType = organizerType;
  if (status) where.status = status;
  if (q) where.title = { contains: q, mode: 'insensitive' };

  const [total, items] = await prisma.$transaction([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, title: true, eventDate: true, organizerType: true, status: true,
        templatePath: true, createdAt: true, updatedAt: true, submittedAt: true, publishedAt: true,
        createdBy: userBrief,
        _count: { select: { certificates: true, signatures: true } },
      },
    }),
  ]);

  return {
    items: items.map(({ templatePath, ...e }) => ({ ...e, hasTemplate: Boolean(templatePath) })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

async function getDetail(user, eventId) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      createdBy: userBrief,
      reviewedBy: userBrief,
      signatures: { orderBy: { sortOrder: 'asc' } },
      logos: { orderBy: { sortOrder: 'asc' } },
    },
  });

  // Status email hanya relevan untuk sertifikat yang sudah terbit
  const [emailStats, total, issued, revoked] = await Promise.all([
    prisma.certificate.groupBy({ by: ['emailStatus'], where: { eventId, issuedAt: { not: null } }, _count: true }),
    prisma.certificate.count({ where: { eventId } }),
    prisma.certificate.count({ where: { eventId, issuedAt: { not: null }, status: 'ACTIVE' } }),
    prisma.certificate.count({ where: { eventId, status: 'REVOKED' } }),
  ]);

  const { templatePath, signatures, logos, ...rest } = event;
  return {
    ...rest,
    hasTemplate: Boolean(templatePath),
    templateUrl: templatePath ? `/api/events/${event.id}/template/image` : null,
    signatures: signatures.map(serializeSignature),
    logos: logos.map(({ imagePath, ...l }) => ({ ...l, imageUrl: `/api/events/${l.eventId}/logos/${l.id}/image` })),
    stats: {
      participants: total,
      issue: { issued, unissued: total - issued - revoked, revoked },
      email: Object.fromEntries(emailStats.map((s) => [s.emailStatus, s._count])),
    },
    readiness: await readiness(event),
    permissions: permissionsFor(user, event),
  };
}

function serializeSignature({ imagePath, ...sig }) {
  return { ...sig, imageUrl: `/api/events/${sig.eventId}/signatures/${sig.id}/image` };
}

// ---------------------------------------------------------------------
// Mutasi
// ---------------------------------------------------------------------
function create(user, data) {
  return prisma.event.create({
    data: {
      ...data,
      organizerType: user.role === ROLES.ADMIN ? 'PRODI' : 'HMP',
      createdById: user.id,
    },
  });
}

function update(event, data) {
  return prisma.event.update({ where: { id: event.id }, data });
}

async function remove(event) {
  const [signatures, logos] = await Promise.all([
    prisma.eventSignature.findMany({ where: { eventId: event.id }, select: { imagePath: true } }),
    prisma.eventLogo.findMany({ where: { eventId: event.id }, select: { imagePath: true } }),
  ]);
  await prisma.event.delete({ where: { id: event.id } }); // cascade: signatures, logos & certificates
  await Promise.all([
    storage.removeFile(event.templatePath),
    ...[...signatures, ...logos].map((s) => storage.removeFile(s.imagePath)),
    storage.removeDir(`certificates/${event.id}`),
  ]);
}

/**
 * Validasi & simpan template. Gambar di-decode ulang oleh sharp (menolak file palsu,
 * membuang metadata EXIF, menormalkan orientasi) lalu disimpan dengan nama acak.
 * Jika ukuran berubah, layout di-reset ke default karena koordinat lama tidak lagi relevan.
 */
async function saveTemplate(event, file) {
  if (!file) throw new AppError('File template wajib diunggah.', 422);

  let image;
  try {
    image = sharp(file.buffer, { failOn: 'error' }).rotate();
    const meta = await image.metadata();
    if (!['png', 'jpeg'].includes(meta.format)) throw new Error('format');
  } catch {
    throw new AppError('File template bukan gambar PNG/JPG yang valid.', 415);
  }

  const { data, info } = await image
    .resize({ width: MAX_TEMPLATE_SIDE, height: MAX_TEMPLATE_SIDE, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' }) // template tidak perlu transparansi
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  if (Math.max(info.width, info.height) < MIN_TEMPLATE_SIDE) {
    throw new AppError(`Resolusi template terlalu kecil (min. sisi terpanjang ${MIN_TEMPLATE_SIDE}px).`, 422);
  }

  const templatePath = await storage.saveBuffer('uploads/templates', 'jpg', data);
  const sizeChanged = info.width !== event.templateWidth || info.height !== event.templateHeight;

  const updated = await prisma.event.update({
    where: { id: event.id },
    data: {
      templatePath,
      templateWidth: info.width,
      templateHeight: info.height,
      ...(sizeChanged || !event.layout ? { layout: defaultLayout(info.width, info.height) } : {}),
    },
  });
  await storage.removeFile(event.templatePath);
  return { event: updated, layoutReset: sizeChanged && Boolean(event.layout) };
}

// ---------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------

/** Daftar hal yang belum lengkap sebelum event bisa diajukan / diterbitkan. */
async function readiness(event) {
  const problems = [];
  if (!event.templatePath) problems.push('Template sertifikat belum diunggah.');
  if (!event.layout?.fields?.participantName) problems.push('Posisi Nama Peserta belum diatur di builder.');
  const participants = await prisma.certificate.count({ where: { eventId: event.id } });
  if (participants === 0) problems.push('Belum ada peserta. Import CSV peserta terlebih dahulu.');
  return { ready: problems.length === 0, problems };
}

async function assertReady(event) {
  const { ready, problems } = await readiness(event);
  if (!ready) throw new AppError(`Event belum lengkap: ${problems.join(' ')}`, 422);
}

// Transisi status atomik: hanya berhasil jika status masih sama seperti yang diperiksa
async function transition(event, fromStatuses, data) {
  const { count } = await prisma.event.updateMany({
    where: { id: event.id, status: { in: fromStatuses } },
    data,
  });
  if (count === 0) throw new AppError('Status event telah berubah. Muat ulang halaman.', 409);
  return prisma.event.findUnique({ where: { id: event.id } });
}

async function submit(event) {
  await assertReady(event);
  return transition(event, [S.DRAFT, S.REJECTED], {
    status: S.PENDING_APPROVAL, submittedAt: new Date(), reviewNote: null, reviewedAt: null, reviewedById: null,
  });
}

function approve(event, reviewer, note) {
  return transition(event, [S.PENDING_APPROVAL], {
    status: S.APPROVED, reviewedById: reviewer.id, reviewedAt: new Date(), reviewNote: note || null,
  });
}

function reject(event, reviewer, note) {
  return transition(event, [S.PENDING_APPROVAL], {
    status: S.REJECTED, reviewedById: reviewer.id, reviewedAt: new Date(), reviewNote: note,
  });
}

/** Terbitkan: kunci event & tandai semua sertifikat sebagai issued. */
/**
 * Buka kunci event (APPROVED / PUBLISHED -> DRAFT) agar template, layout & peserta bisa diperbaiki.
 * Semua sertifikat ditarik dari akses publik (issuedAt = null) sampai diterbitkan ulang, cache PDF
 * lama dihapus, dan status email direset karena email terdahulu berisi versi yang salah.
 * Nomor & kode verifikasi (QR) tetap sama sehingga sertifikat yang sudah tercetak akan valid lagi
 * setelah diterbitkan ulang.
 */
async function unlock(event, user, note) {
  const [issued, emailed] = await Promise.all([
    prisma.certificate.count({ where: { eventId: event.id, issuedAt: { not: null } } }),
    prisma.certificate.count({ where: { eventId: event.id, emailStatus: 'SENT' } }),
  ]);
  const updated = await transition(event, [S.APPROVED, S.PUBLISHED], {
    status: S.DRAFT, reviewNote: note, reviewedById: user.id, reviewedAt: new Date(), publishedAt: null, submittedAt: null,
  });
  await prisma.certificate.updateMany({
    where: { eventId: event.id },
    data: { issuedAt: null, pdfPath: null, emailStatus: 'PENDING', emailError: null },
  });
  await storage.removeDir(`certificates/${event.id}`);
  return { event: updated, issued, emailed };
}

/**
 * Kunci event untuk penerbitan. `issueAll` = langsung terbitkan sertifikat semua peserta;
 * bila false, peserta diterbitkan satu per satu / terpilih lewat manajemen penerbitan.
 * Tidak mengirim email (pengiriman email terpisah).
 */
async function publish(event, { issueAll = true } = {}) {
  await assertReady(event);
  const from = event.organizerType === 'PRODI' ? [S.DRAFT] : [S.APPROVED];
  const now = new Date();
  const published = await transition(event, from, { status: S.PUBLISHED, publishedAt: now });
  if (issueAll) await prisma.certificate.updateMany({ where: { eventId: event.id, issuedAt: null }, data: { issuedAt: now } });
  return published;
}

module.exports = {
  list, getDetail, serializeSignature, create, update, remove, saveTemplate,
  readiness, submit, approve, reject, publish, unlock,
};
