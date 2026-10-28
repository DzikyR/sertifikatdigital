const sharp = require('sharp');
const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const storage = require('../utils/storage');

const MAX_SIGNATURES = 10;
const MAX_SIDE = 1500;

/** Validasi PNG (magic bytes via sharp), buang metadata, batasi resolusi. */
async function processPng(file) {
  if (!file) throw new AppError('File tanda tangan (PNG) wajib diunggah.', 422);
  try {
    const img = sharp(file.buffer, { failOn: 'error' });
    const meta = await img.metadata();
    if (meta.format !== 'png') throw new Error('format');
    const { data, info } = await img
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });
    return { data, info, hasAlpha: meta.hasAlpha };
  } catch {
    throw new AppError('File tanda tangan bukan PNG yang valid.', 415);
  }
}

/** Ukuran & posisi awal TTD baru: ~18% lebar template, ditempatkan di area bawah. */
function initialBox(event, info, index) {
  const tw = event.templateWidth || 2000;
  const th = event.templateHeight || 1414;
  const width = Math.round(tw * 0.18);
  const height = Math.min(Math.round((width * info.height) / info.width), Math.round(th * 0.2));
  // 3 slot berjajar di kiri-tengah (kanan bawah untuk QR default), baris baru setiap 3 TTD
  const slot = index % 3;
  const row = Math.floor(index / 3) % 2;
  return {
    posX: Math.min(Math.round(tw * (0.1 + slot * 0.22)), tw - width),
    posY: Math.min(Math.round(th * (0.68 - row * 0.2)), th - height),
    width,
    height,
  };
}

/** Status TTD pustaka untuk penyelenggara event; null = boleh dipakai. */
function libraryProblem(lib, event) {
  if (!lib) return 'tidak lagi tersedia di pustaka';
  if (!lib.isActive) return 'dinonaktifkan oleh Kaprodi/Admin Prodi';
  if (event.organizerType === 'HMP' && !lib.hmpAllowed) return 'tidak diizinkan untuk event HMP';
  return null;
}

/**
 * Pakai TTD dari pustaka di event (penyelenggara tidak bisa mengunggah gambar TTD sendiri).
 * Label, nama & jabatan mengikuti pustaka; penyelenggara hanya mengatur posisi & tampil/tidaknya teks.
 */
async function create(event, { librarySignatureId, showSignerText }) {
  const lib = await prisma.signatureLibrary.findUnique({ where: { id: librarySignatureId } });
  const problem = lib ? libraryProblem(lib, event) : 'tidak ditemukan';
  if (problem) throw new AppError(`Tanda tangan ${problem}.`, lib ? 403 : 404);
  const [count, dup] = await Promise.all([
    prisma.eventSignature.count({ where: { eventId: event.id } }),
    prisma.eventSignature.findFirst({ where: { eventId: event.id, librarySignatureId: lib.id }, select: { id: true } }),
  ]);
  if (dup) throw new AppError(`Tanda tangan "${lib.label}" sudah dipakai di event ini.`, 409);
  if (count >= MAX_SIGNATURES) throw new AppError(`Maksimal ${MAX_SIGNATURES} tanda tangan per event.`, 422);

  const info = await sharp(storage.absPath(lib.imagePath)).metadata();
  return prisma.eventSignature.create({
    data: {
      eventId: event.id,
      librarySignatureId: lib.id,
      label: lib.label,
      signerName: lib.signerName,
      signerTitle: lib.signerTitle,
      showSignerText: showSignerText ?? true,
      imagePath: lib.imagePath,
      sortOrder: count,
      ...initialBox(event, info, count),
    },
  });
}

async function findInEvent(event, signatureId) {
  const sig = await prisma.eventSignature.findFirst({ where: { id: signatureId, eventId: event.id } });
  if (!sig) throw new AppError('Tanda tangan tidak ditemukan.', 404);
  return sig;
}

/** Penyelenggara hanya boleh mengatur apakah nama & jabatan dicetak. */
async function update(event, signatureId, { showSignerText }) {
  const sig = await findInEvent(event, signatureId);
  if (showSignerText === undefined) return sig;
  return prisma.eventSignature.update({ where: { id: sig.id }, data: { showSignerText } });
}

/** Lepas TTD dari event. Gambar tetap disimpan di pustaka. */
async function remove(event, signatureId) {
  const sig = await findInEvent(event, signatureId);
  await prisma.eventSignature.delete({ where: { id: sig.id } });
}

// ---------------- Pustaka (Kaprodi/Admin Prodi) ----------------

const userBrief = { select: { name: true } };

/** ADMIN melihat semua; HMP hanya TTD aktif yang diizinkan untuk HMP. */
function listLibrary(user) {
  const where = user.role === 'ADMIN' ? {} : { isActive: true, hmpAllowed: true };
  return prisma.signatureLibrary.findMany({
    where,
    orderBy: [{ isActive: 'desc' }, { label: 'asc' }],
    include: { createdBy: userBrief, _count: { select: { usages: true } } },
  });
}

async function findLibrary(id, user) {
  const lib = await prisma.signatureLibrary.findUnique({ where: { id } });
  const visible = lib && (user.role === 'ADMIN' || (user.role === 'HMP' && lib.isActive && lib.hmpAllowed));
  if (!visible) throw new AppError('Tanda tangan tidak ditemukan.', 404);
  return lib;
}

async function createLibrary(file, fields, user) {
  const { data, hasAlpha } = await processPng(file);
  const imagePath = await storage.saveBuffer('uploads/signatures', 'png', data);
  const lib = await prisma.signatureLibrary.create({
    data: {
      label: fields.label,
      signerName: fields.signerName || null,
      signerTitle: fields.signerTitle || null,
      hmpAllowed: fields.hmpAllowed ?? true,
      imagePath,
      createdById: user.id,
    },
  });
  return { lib, warning: hasAlpha ? null : 'PNG tidak memiliki latar transparan; latar putih akan menutupi template.' };
}

/**
 * Ubah keterangan / status TTD pustaka. Keterangan baru ikut diterapkan ke event yang belum terbit;
 * sertifikat yang sudah terbit tidak berubah.
 */
async function updateLibrary(id, fields, user) {
  const lib = await findLibrary(id, user);
  const data = {};
  for (const k of ['label', 'signerName', 'signerTitle']) if (fields[k] !== undefined) data[k] = fields[k] || null;
  for (const k of ['isActive', 'hmpAllowed']) if (fields[k] !== undefined) data[k] = fields[k];
  if (data.label === null) delete data.label;
  const updated = await prisma.signatureLibrary.update({ where: { id: lib.id }, data });
  const text = Object.fromEntries(['label', 'signerName', 'signerTitle'].filter((k) => k in data).map((k) => [k, data[k]]));
  if (Object.keys(text).length) {
    await prisma.eventSignature.updateMany({
      where: { librarySignatureId: lib.id, event: { status: { not: 'PUBLISHED' } } },
      data: text,
    });
  }
  return updated;
}

/** Hapus dari pustaka hanya bila belum pernah dipakai event; selain itu cukup dinonaktifkan. */
async function removeLibrary(id, user) {
  const lib = await findLibrary(id, user);
  const used = await prisma.eventSignature.count({ where: { librarySignatureId: lib.id } });
  if (used) throw new AppError(`Tanda tangan masih dipakai di ${used} event. Nonaktifkan saja agar tidak bisa dipilih lagi.`, 409);
  await prisma.signatureLibrary.delete({ where: { id: lib.id } });
  const shared = await prisma.eventSignature.count({ where: { imagePath: lib.imagePath } });
  if (!shared) await storage.removeFile(lib.imagePath);
  return lib;
}

module.exports = {
  create, findInEvent, update, remove, libraryProblem, listLibrary, findLibrary, createLibrary, updateLibrary, removeLibrary,
};
