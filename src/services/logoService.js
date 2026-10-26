const sharp = require('sharp');
const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const storage = require('../utils/storage');

const MAX_LOGOS = 10;
const MAX_SIDE = 1200;
const FORMATS = ['png', 'jpeg', 'webp', 'svg'];

/**
 * Validasi gambar logo (magic bytes via sharp), buang metadata, batasi resolusi, simpan sebagai PNG
 * (transparansi dipertahankan). SVG dirender ke PNG beresolusi tinggi agar tajam di PDF.
 */
async function processImage(file) {
  if (!file) throw new AppError('File logo wajib diunggah.', 422);
  try {
    const probe = await sharp(file.buffer, { failOn: 'error' }).metadata();
    if (!FORMATS.includes(probe.format)) throw new Error('format');
    const img = sharp(file.buffer, { failOn: 'error', ...(probe.format === 'svg' ? { density: 300 } : {}) });
    const { data, info } = await img
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: probe.format !== 'svg' })
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });
    return { data, info, hasAlpha: probe.hasAlpha || probe.format === 'svg' };
  } catch {
    throw new AppError('File logo harus berupa gambar PNG, JPG, WEBP, atau SVG yang valid.', 415);
  }
}

/** Posisi awal: berjajar di area atas template (tepat di kanan logo terakhir), tinggi ~11% template. */
function initialBox(event, info, existing) {
  const tw = event.templateWidth || 2000;
  const th = event.templateHeight || 1414;
  const height = Math.round(th * 0.11);
  const width = Math.min(Math.round((height * info.width) / info.height), Math.round(tw * 0.3));
  const fitHeight = Math.round((width * info.height) / info.width);
  const gap = Math.round(tw * 0.02);
  const right = existing.reduce((max, l) => Math.max(max, l.posX + l.width), 0);
  const posX = right ? right + gap : Math.round(tw * 0.06);
  return {
    posX: posX + width > tw ? Math.round(tw * 0.06) : posX, // penuh -> mulai lagi dari kiri
    posY: Math.min(Math.round(th * 0.05), th - fitHeight),
    width,
    height: fitHeight,
  };
}

async function create(event, file, { label }) {
  const existing = await prisma.eventLogo.findMany({ where: { eventId: event.id }, select: { posX: true, width: true } });
  const count = existing.length;
  if (count >= MAX_LOGOS) throw new AppError(`Maksimal ${MAX_LOGOS} logo per event.`, 422);

  const { data, info, hasAlpha } = await processImage(file);
  const imagePath = await storage.saveBuffer('uploads/logos', 'png', data);
  const logo = await prisma.eventLogo.create({
    data: { eventId: event.id, label, imagePath, sortOrder: count, ...initialBox(event, info, existing) },
  });
  return { logo, warning: hasAlpha ? null : 'Logo tidak memiliki latar transparan; latar putihnya akan terlihat di atas template.' };
}

async function findInEvent(event, logoId) {
  const logo = await prisma.eventLogo.findFirst({ where: { id: logoId, eventId: event.id } });
  if (!logo) throw new AppError('Logo tidak ditemukan.', 404);
  return logo;
}

async function remove(event, logoId) {
  const logo = await findInEvent(event, logoId);
  await prisma.eventLogo.delete({ where: { id: logo.id } });
  await storage.removeFile(logo.imagePath);
}

const serializeLogo = ({ imagePath, ...logo }) => ({ ...logo, imageUrl: `/api/events/${logo.eventId}/logos/${logo.id}/image` });

module.exports = { MAX_LOGOS, create, findInEvent, remove, serializeLogo };
