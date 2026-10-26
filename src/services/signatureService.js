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

async function create(event, file, fields) {
  const count = await prisma.eventSignature.count({ where: { eventId: event.id } });
  if (count >= MAX_SIGNATURES) throw new AppError(`Maksimal ${MAX_SIGNATURES} tanda tangan per event.`, 422);

  const { data, info, hasAlpha } = await processPng(file);
  const imagePath = await storage.saveBuffer('uploads/signatures', 'png', data);

  const signature = await prisma.eventSignature.create({
    data: {
      eventId: event.id,
      label: fields.label,
      signerName: fields.signerName || null,
      signerTitle: fields.signerTitle || null,
      showSignerText: fields.showSignerText ?? true,
      imagePath,
      sortOrder: count,
      ...initialBox(event, info, count),
    },
  });
  return { signature, warning: hasAlpha ? null : 'PNG tidak memiliki latar transparan; latar putih akan menutupi template.' };
}

async function findInEvent(event, signatureId) {
  const sig = await prisma.eventSignature.findFirst({ where: { id: signatureId, eventId: event.id } });
  if (!sig) throw new AppError('Tanda tangan tidak ditemukan.', 404);
  return sig;
}

async function update(event, signatureId, fields, file) {
  const sig = await findInEvent(event, signatureId);
  const data = { ...fields };
  if (file) {
    const { data: buf } = await processPng(file);
    data.imagePath = await storage.saveBuffer('uploads/signatures', 'png', buf);
  }
  const updated = await prisma.eventSignature.update({ where: { id: sig.id }, data });
  if (file) await storage.removeFile(sig.imagePath);
  return updated;
}

async function remove(event, signatureId) {
  const sig = await findInEvent(event, signatureId);
  await prisma.eventSignature.delete({ where: { id: sig.id } });
  await storage.removeFile(sig.imagePath);
}

module.exports = { create, findInEvent, update, remove };
