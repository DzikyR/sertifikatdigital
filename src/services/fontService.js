const fs = require('fs/promises');
const path = require('path');
const fontkit = require('fontkit');
const prisma = require('../config/database');
const config = require('../config');
const AppError = require('../utils/AppError');
const storage = require('../utils/storage');

/**
 * Registry font sertifikat.
 * - Font standar PDF (Helvetica/Times/Courier): tanpa file, dipakai langsung oleh PDFKit.
 * - Font bawaan aplikasi: file WOFF di public/fonts (lisensi SIL OFL, sumber Google Fonts).
 * - Font kustom: diunggah pengguna, disimpan di storage/uploads/fonts, kunci "custom:<id>".
 *
 * Tiap varian (mis. Playfair-Bold) adalah font tersendiri dengan bentuk huruf sudah tebal/miring,
 * sehingga di kanvas cukup dimuat sebagai family terpisah dengan weight/style normal.
 */
const CUSTOM_PREFIX = 'custom:';
const MAX_CUSTOM_FONTS = 100;

const STANDARD = {
  Helvetica: { label: 'Helvetica', css: 'Helvetica, Arial, sans-serif', weight: 'normal', style: 'normal' },
  'Helvetica-Bold': { label: 'Helvetica Bold', css: 'Helvetica, Arial, sans-serif', weight: 'bold', style: 'normal' },
  'Helvetica-Oblique': { label: 'Helvetica Italic', css: 'Helvetica, Arial, sans-serif', weight: 'normal', style: 'italic' },
  'Times-Roman': { label: 'Times', css: '"Times New Roman", Times, serif', weight: 'normal', style: 'normal' },
  'Times-Bold': { label: 'Times Bold', css: '"Times New Roman", Times, serif', weight: 'bold', style: 'normal' },
  'Times-Italic': { label: 'Times Italic', css: '"Times New Roman", Times, serif', weight: 'normal', style: 'italic' },
  'Times-BoldItalic': { label: 'Times Bold Italic', css: '"Times New Roman", Times, serif', weight: 'bold', style: 'italic' },
  Courier: { label: 'Courier', css: '"Courier New", Courier, monospace', weight: 'normal', style: 'normal' },
  'Courier-Bold': { label: 'Courier Bold', css: '"Courier New", Courier, monospace', weight: 'bold', style: 'normal' },
};

// [kunci, label, grup, file di public/fonts]
const BUNDLED_LIST = [
  ['GreatVibes', 'Great Vibes', 'Script / Kaligrafi', 'great-vibes-latin-400-normal.woff'],
  ['PinyonScript', 'Pinyon Script', 'Script / Kaligrafi', 'pinyon-script-latin-400-normal.woff'],
  ['AlexBrush', 'Alex Brush', 'Script / Kaligrafi', 'alex-brush-latin-400-normal.woff'],
  ['DancingScript', 'Dancing Script', 'Script / Kaligrafi', 'dancing-script-latin-400-normal.woff'],
  ['DancingScript-Bold', 'Dancing Script Bold', 'Script / Kaligrafi', 'dancing-script-latin-700-normal.woff'],
  ['Playfair', 'Playfair Display', 'Serif', 'playfair-display-latin-400-normal.woff'],
  ['Playfair-Italic', 'Playfair Display Italic', 'Serif', 'playfair-display-latin-400-italic.woff'],
  ['Playfair-Bold', 'Playfair Display Bold', 'Serif', 'playfair-display-latin-700-normal.woff'],
  ['Playfair-BoldItalic', 'Playfair Display Bold Italic', 'Serif', 'playfair-display-latin-700-italic.woff'],
  ['Cinzel', 'Cinzel', 'Serif', 'cinzel-latin-400-normal.woff'],
  ['Cinzel-Bold', 'Cinzel Bold', 'Serif', 'cinzel-latin-700-normal.woff'],
  ['Lora', 'Lora', 'Serif', 'lora-latin-400-normal.woff'],
  ['Lora-Italic', 'Lora Italic', 'Serif', 'lora-latin-400-italic.woff'],
  ['Lora-Bold', 'Lora Bold', 'Serif', 'lora-latin-700-normal.woff'],
  ['Lora-BoldItalic', 'Lora Bold Italic', 'Serif', 'lora-latin-700-italic.woff'],
  ['EBGaramond', 'EB Garamond', 'Serif', 'eb-garamond-latin-400-normal.woff'],
  ['EBGaramond-Italic', 'EB Garamond Italic', 'Serif', 'eb-garamond-latin-400-italic.woff'],
  ['EBGaramond-Bold', 'EB Garamond Bold', 'Serif', 'eb-garamond-latin-700-normal.woff'],
  ['Montserrat', 'Montserrat', 'Sans Serif', 'montserrat-latin-400-normal.woff'],
  ['Montserrat-Italic', 'Montserrat Italic', 'Sans Serif', 'montserrat-latin-400-italic.woff'],
  ['Montserrat-SemiBold', 'Montserrat SemiBold', 'Sans Serif', 'montserrat-latin-600-normal.woff'],
  ['Montserrat-Bold', 'Montserrat Bold', 'Sans Serif', 'montserrat-latin-700-normal.woff'],
  ['Montserrat-BoldItalic', 'Montserrat Bold Italic', 'Sans Serif', 'montserrat-latin-700-italic.woff'],
  ['Poppins', 'Poppins', 'Sans Serif', 'poppins-latin-400-normal.woff'],
  ['Poppins-Italic', 'Poppins Italic', 'Sans Serif', 'poppins-latin-400-italic.woff'],
  ['Poppins-SemiBold', 'Poppins SemiBold', 'Sans Serif', 'poppins-latin-600-normal.woff'],
  ['Poppins-Bold', 'Poppins Bold', 'Sans Serif', 'poppins-latin-700-normal.woff'],
];
const BUNDLED = Object.fromEntries(BUNDLED_LIST.map(([key, label, group, file]) => [key, { label, group, file }]));

const cssFamily = (key) => `sdf-${key.replace(/[^A-Za-z0-9-]/g, '-')}`;
const isCustomKey = (key) => typeof key === 'string' && key.startsWith(CUSTOM_PREFIX);
const customId = (key) => key.slice(CUSTOM_PREFIX.length);

/** Daftar semua font untuk builder (standar + bawaan + kustom). */
async function listFonts() {
  const standard = Object.entries(STANDARD).map(([name, f]) => ({ name, group: 'Standar PDF', ...f, url: null }));
  const bundled = BUNDLED_LIST.map(([name, label, group, file]) => ({
    name, label, group, css: cssFamily(name), weight: 'normal', style: 'normal', url: `/fonts/${file}`,
  }));
  const customs = await prisma.customFont.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, createdById: true, createdAt: true, createdBy: { select: { name: true } } },
  });
  const custom = customs.map((c) => ({
    name: `${CUSTOM_PREFIX}${c.id}`, label: c.name, group: 'Font Kustom', css: cssFamily(`custom-${c.id}`),
    weight: 'normal', style: 'normal', url: `/api/fonts/${c.id}/file`,
    id: c.id, createdById: c.createdById, uploader: c.createdBy?.name || null,
  }));
  return [...standard, ...bundled, ...custom];
}

/** Set kunci font yang valid saat ini (untuk validasi layout). */
async function validKeys() {
  const customs = await prisma.customFont.findMany({ select: { id: true } });
  return new Set([...Object.keys(STANDARD), ...Object.keys(BUNDLED), ...customs.map((c) => `${CUSTOM_PREFIX}${c.id}`)]);
}

/**
 * Baca file font yang dibutuhkan layout. Mengembalikan Map kunci -> Buffer.
 * Font yang filenya hilang (mis. font kustom terhapus) dilewati; PDF memakai Helvetica.
 */
async function loadFontBuffers(keys) {
  const map = new Map();
  const unique = [...new Set(keys)].filter((k) => k && !STANDARD[k]);
  const customIds = unique.filter(isCustomKey).map(customId);
  const customs = customIds.length
    ? await prisma.customFont.findMany({ where: { id: { in: customIds } }, select: { id: true, filePath: true } })
    : [];
  const customPath = Object.fromEntries(customs.map((c) => [`${CUSTOM_PREFIX}${c.id}`, storage.absPath(c.filePath)]));

  await Promise.all(unique.map(async (key) => {
    const abs = BUNDLED[key] ? path.join(config.paths.public, 'fonts', BUNDLED[key].file) : customPath[key];
    if (!abs) return;
    try {
      map.set(key, await fs.readFile(abs));
    } catch (err) {
      console.error('[font] gagal membaca', key, err.message);
    }
  }));
  return map;
}

// ---------------------------------------------------------------- font kustom

const FORMATS = { ttf: 'ttf', otf: 'otf', woff: 'woff' };

/** Validasi isi file dengan fontkit (bukan sekadar ekstensi) lalu simpan. */
async function uploadCustom({ buffer, originalName, name }, user) {
  const ext = path.extname(originalName || '').slice(1).toLowerCase();
  if (!FORMATS[ext]) throw new AppError('Font harus berformat TTF, OTF, atau WOFF.', 415);

  let font;
  try {
    font = fontkit.create(buffer);
  } catch {
    throw new AppError('File bukan font yang valid atau rusak.', 422);
  }
  if (font.fonts) throw new AppError('File koleksi font (TTC) tidak didukung. Unggah satu file font saja.', 422);
  if (!font.numGlyphs || !font.hasGlyphForCodePoint(0x41)) {
    throw new AppError('Font tidak memiliki huruf Latin (A-Z) sehingga tidak bisa dipakai untuk sertifikat.', 422);
  }

  const total = await prisma.customFont.count();
  if (total >= MAX_CUSTOM_FONTS) throw new AppError(`Maksimal ${MAX_CUSTOM_FONTS} font kustom. Hapus font yang tidak terpakai.`, 422);

  const displayName = String(name || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 80)
    || [font.familyName, font.subfamilyName && font.subfamilyName !== 'Regular' ? font.subfamilyName : '']
      .filter(Boolean).join(' ').slice(0, 80)
    || 'Font Kustom';

  const filePath = await storage.saveBuffer('uploads/fonts', FORMATS[ext], buffer);
  return prisma.customFont.create({ data: { name: displayName, filePath, format: FORMATS[ext], createdById: user.id } });
}

/** Event yang layout-nya memakai font tertentu (kunci font disimpan di JSON layout). */
async function eventsUsingFont(key) {
  return prisma.$queryRaw`SELECT id, title FROM "Event" WHERE layout::text LIKE ${`%"${key}"%`} LIMIT 5`;
}

async function removeCustom(id, user) {
  const font = await prisma.customFont.findUnique({ where: { id } });
  if (!font) throw new AppError('Font tidak ditemukan.', 404);
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN' && font.createdById !== user.id) {
    throw new AppError('Hanya pengunggah atau Kaprodi/Admin Prodi yang dapat menghapus font ini.', 403);
  }
  const used = await eventsUsingFont(`${CUSTOM_PREFIX}${id}`);
  if (used.length) {
    throw new AppError(`Font masih dipakai di event: ${used.map((e) => `"${e.title}"`).join(', ')}. Ganti fontnya di builder terlebih dahulu.`, 409);
  }
  await prisma.customFont.delete({ where: { id } });
  await storage.removeFile(font.filePath);
  return font;
}

async function customFile(id) {
  const font = await prisma.customFont.findUnique({ where: { id } });
  if (!font) throw new AppError('Font tidak ditemukan.', 404);
  return font;
}

module.exports = {
  STANDARD, BUNDLED, CUSTOM_PREFIX, listFonts, validKeys, loadFontBuffers, uploadCustom, removeCustom, customFile,
};
