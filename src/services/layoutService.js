const AppError = require('../utils/AppError');
const fontService = require('./fontService');

/**
 * Konvensi koordinat (semua dalam px relatif ukuran ASLI template):
 * - Teks : (x, y) = titik jangkar. x mengikuti `align` (left = tepi kiri, center = tengah,
 *          right = tepi kanan); y = garis tengah vertikal teks. `maxWidth` = lebar kotak;
 *          teks yang terlalu panjang otomatis diperkecil agar muat 1 baris.
 * - QR   : (x, y) = pojok kiri-atas, `size` = sisi persegi.
 * - TTD  : (posX, posY) = pojok kiri-atas, width/height = kotak (gambar di-fit proporsional).
 * Fabric.js di Tahap 4 memakai originX = align & originY = 'center' agar konsisten.
 */

const FIELD_KEYS = ['participantName', 'certificateNumber', 'eventName', 'eventTheme', 'eventDate', 'participantRole'];
const REQUIRED_FIELDS = ['participantName'];

/**
 * Tema = paduan font & warna siap pakai untuk semua elemen teks. Diterapkan di builder
 * (posisi & ukuran tidak berubah). `fields.default` berlaku untuk field yang tidak disebut.
 */
const THEMES = [
  {
    id: 'standar', name: 'Standar', description: 'Font PDF bawaan, biru TSU',
    fields: {
      participantName: { font: 'Times-BoldItalic', color: '#0c2c5e' },
      eventName: { font: 'Helvetica-Bold', color: '#0f172a' },
      default: { font: 'Helvetica', color: '#0f172a' },
    },
    signatureText: { font: 'Helvetica-Bold', titleFont: 'Helvetica', color: '#0f172a' },
  },
  {
    id: 'klasik-emas', name: 'Klasik Emas', description: 'Kaligrafi Great Vibes + Playfair, aksen emas',
    fields: {
      participantName: { font: 'GreatVibes', color: '#8a6a12' },
      eventName: { font: 'Playfair-Bold', color: '#1f2937' },
      default: { font: 'Playfair', color: '#374151' },
    },
    signatureText: { font: 'Playfair-Bold', titleFont: 'Playfair', color: '#1f2937' },
  },
  {
    id: 'formal-tsu', name: 'Formal Biru TSU', description: 'Playfair italic + Montserrat, biru tua',
    fields: {
      participantName: { font: 'Playfair-BoldItalic', color: '#0c2c5e' },
      eventName: { font: 'Montserrat-Bold', color: '#0c2c5e' },
      default: { font: 'Montserrat', color: '#334155' },
    },
    signatureText: { font: 'Montserrat-Bold', titleFont: 'Montserrat', color: '#0c2c5e' },
  },
  {
    id: 'elegan', name: 'Elegan Kaligrafi', description: 'Pinyon Script + Cinzel, cokelat tua',
    fields: {
      participantName: { font: 'PinyonScript', color: '#1e293b' },
      eventName: { font: 'Cinzel-Bold', color: '#7c2d12' },
      default: { font: 'EBGaramond', color: '#44403c' },
    },
    signatureText: { font: 'Cinzel-Bold', titleFont: 'EBGaramond', color: '#44403c' },
  },
  {
    id: 'akademik', name: 'Akademik', description: 'Cinzel + EB Garamond, kesan resmi',
    fields: {
      participantName: { font: 'Cinzel-Bold', color: '#0f172a' },
      eventName: { font: 'EBGaramond-Bold', color: '#1e3a8a' },
      default: { font: 'EBGaramond', color: '#1f2937' },
    },
    signatureText: { font: 'EBGaramond-Bold', titleFont: 'EBGaramond-Italic', color: '#1f2937' },
  },
  {
    id: 'modern', name: 'Modern', description: 'Poppins tegas, biru cerah',
    fields: {
      participantName: { font: 'Poppins-Bold', color: '#111827' },
      eventName: { font: 'Poppins-SemiBold', color: '#2259b5' },
      default: { font: 'Poppins', color: '#475569' },
    },
    signatureText: { font: 'Poppins-SemiBold', titleFont: 'Poppins', color: '#111827' },
  },
  {
    id: 'ceria', name: 'Ceria', description: 'Dancing Script + Poppins, untuk lomba/workshop',
    fields: {
      participantName: { font: 'DancingScript-Bold', color: '#be185d' },
      eventName: { font: 'Poppins-Bold', color: '#0f766e' },
      default: { font: 'Poppins', color: '#334155' },
    },
    signatureText: { font: 'Poppins-SemiBold', titleFont: 'Poppins', color: '#334155' },
  },
  {
    id: 'lembut', name: 'Lembut', description: 'Alex Brush + Lora, hijau zaitun',
    fields: {
      participantName: { font: 'AlexBrush', color: '#3f6212' },
      eventName: { font: 'Lora-Bold', color: '#1c1917' },
      default: { font: 'Lora-Italic', color: '#44403c' },
    },
    signatureText: { font: 'Lora-Bold', titleFont: 'Lora-Italic', color: '#1c1917' },
  },
];

const ALIGNS = ['left', 'center', 'right'];

// Teks kustom: blok teks bebas (boleh beberapa baris) dengan isian otomatis {placeholder}
const MAX_TEXTS = 20;
const MAX_TEXT_LENGTH = 1000;
const PLACEHOLDERS = {
  nama: 'Nama peserta',
  peran: 'Peran peserta',
  instansi: 'Instansi peserta',
  nomor: 'Nomor sertifikat',
  kegiatan: 'Nama kegiatan',
  tema: 'Tema kegiatan',
  hari: 'Hari kegiatan',
  tanggal: 'Tanggal kegiatan',
  lokasi: 'Lokasi kegiatan',
};

/** Ganti {placeholder} dengan nilainya; placeholder tak dikenal dibiarkan apa adanya. */
function fillPlaceholders(text, values) {
  return String(text || '').replace(/\{([a-z]+)\}/gi, (m, key) => {
    const k = key.toLowerCase();
    return Object.hasOwn(PLACEHOLDERS, k) ? (values[k] ?? '') : m;
  });
}
const HEX = /^#[0-9a-fA-F]{6}$/;

/** QR default di pojok kanan bawah (area kiri-tengah dipakai TTD). */
function defaultQr(w, h) {
  const size = Math.round(Math.min(w, h) * 0.15);
  return { x: w - size - Math.round(w * 0.07), y: h - size - Math.round(h * 0.09), size };
}

/** Layout awal yang masuk akal untuk template berukuran w x h. */
function defaultLayout(w, h) {
  const cx = Math.round(w / 2);
  const base = Math.round(h / 40);
  const field = (y, fontSize, font, color = '#0f172a') => ({
    x: cx, y: Math.round(h * y), fontSize, font, color, align: 'center', maxWidth: Math.round(w * 0.7), prefix: '',
  });
  return {
    fields: {
      participantName: field(0.45, base * 2, 'Times-BoldItalic', '#0c2c5e'),
      certificateNumber: { ...field(0.27, Math.round(base * 0.8), 'Helvetica'), prefix: 'No: ' },
      eventName: field(0.56, base, 'Helvetica-Bold'),
      eventDate: field(0.62, Math.round(base * 0.8), 'Helvetica'),
    },
    qr: defaultQr(w, h),
    signatureText: { fontSize: Math.round(base * 0.75), font: 'Helvetica-Bold', titleFont: 'Helvetica', color: '#0f172a' },
  };
}

const clampInt = (v, min, max, name) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) throw new AppError(`Nilai ${name} harus berupa angka.`, 422);
  if (n < min || n > max) throw new AppError(`Nilai ${name} harus di antara ${min} dan ${max}.`, 422);
  return n;
};

const makeFontPicker = (fonts) => (font, name) => {
  if (!fonts.has(font)) throw new AppError(`Font ${name} tidak tersedia (mungkin font kustomnya sudah dihapus).`, 422);
  return font;
};

const pickColor = (color, name) => {
  if (!HEX.test(color || '')) throw new AppError(`Warna ${name} harus format hex (#RRGGBB).`, 422);
  return color.toLowerCase();
};

/**
 * Validasi & sanitasi layout dari builder. Hanya properti yang dikenal yang disimpan
 * (whitelist), semua angka dibatasi ke area template.
 * @param {Set<string>} fonts kunci font yang valid (fontService.validKeys())
 */
function sanitizeLayout(input, { width: w, height: h }, fonts) {
  if (!input || typeof input !== 'object') throw new AppError('Data layout tidak valid.', 422);
  const pickFont = makeFontPicker(fonts);
  const out = { fields: {}, qr: null, signatureText: null };

  const fields = input.fields || {};
  for (const key of FIELD_KEYS) {
    const f = fields[key];
    if (!f) continue;
    out.fields[key] = {
      x: clampInt(f.x, 0, w, `${key}.x`),
      y: clampInt(f.y, 0, h, `${key}.y`),
      fontSize: clampInt(f.fontSize, 6, Math.max(12, Math.round(h / 3)), `${key}.fontSize`),
      font: pickFont(f.font, key),
      color: pickColor(f.color, key),
      align: ALIGNS.includes(f.align) ? f.align : 'center',
      maxWidth: clampInt(f.maxWidth ?? w, 20, w, `${key}.maxWidth`),
      prefix: String(f.prefix ?? '').slice(0, 60),
    };
  }
  for (const key of REQUIRED_FIELDS) {
    if (!out.fields[key]) throw new AppError('Posisi Nama Peserta wajib diatur.', 422);
  }

  if (input.qr) {
    const size = clampInt(input.qr.size, 40, Math.min(w, h), 'qr.size');
    out.qr = {
      x: clampInt(input.qr.x, 0, w - size, 'qr.x'),
      y: clampInt(input.qr.y, 0, h - size, 'qr.y'),
      size,
    };
  }

  const texts = Array.isArray(input.texts) ? input.texts : [];
  if (texts.length > MAX_TEXTS) throw new AppError(`Maksimal ${MAX_TEXTS} teks kustom.`, 422);
  out.texts = texts.map((t, i) => {
    const label = `teks kustom #${i + 1}`;
    const text = String(t.text ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
    if (!text) throw new AppError(`Isi ${label} masih kosong.`, 422);
    if (text.length > MAX_TEXT_LENGTH) throw new AppError(`Isi ${label} maksimal ${MAX_TEXT_LENGTH} karakter.`, 422);
    const lineHeight = Number(t.lineHeight ?? 1.3);
    return {
      id: /^[a-z0-9]{1,20}$/i.test(t.id || '') ? t.id : `t${i + 1}`,
      text,
      x: clampInt(t.x, 0, w, `${label} x`),
      y: clampInt(t.y, 0, h, `${label} y`),
      fontSize: clampInt(t.fontSize, 6, Math.max(12, Math.round(h / 3)), `${label} ukuran font`),
      font: pickFont(t.font, label),
      color: pickColor(t.color, label),
      align: ALIGNS.includes(t.align) ? t.align : 'center',
      maxWidth: clampInt(t.maxWidth ?? w, 20, w, `${label} lebar`),
      lineHeight: Number.isFinite(lineHeight) ? Math.min(Math.max(Math.round(lineHeight * 100) / 100, 0.8), 3) : 1.3,
    };
  });

  const st = input.signatureText || {};
  out.signatureText = {
    fontSize: clampInt(st.fontSize ?? Math.round(h / 55), 6, 200, 'signatureText.fontSize'),
    font: pickFont(st.font ?? 'Helvetica-Bold', 'signatureText'),
    titleFont: pickFont(st.titleFont ?? 'Helvetica', 'signatureText.title'),
    color: pickColor(st.color ?? '#0f172a', 'signatureText'),
  };

  return out;
}

/** Validasi posisi gambar (TTD / logo) dari builder. */
function sanitizeSignaturePositions(list, { width: w, height: h }, name = 'ttd') {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 20).map((s, i) => {
    const width = clampInt(s.width, 10, w, `${name}[${i}].width`);
    const height = clampInt(s.height, 10, h, `${name}[${i}].height`);
    return {
      id: String(s.id || ''),
      posX: clampInt(s.posX, 0, w - width, `${name}[${i}].posX`),
      posY: clampInt(s.posY, 0, h - height, `${name}[${i}].posY`),
      width,
      height,
      sortOrder: i,
    };
  });
}

/** Semua kunci font yang dipakai layout (field + teks TTD), untuk memuat file font di PDF. */
function fontsInLayout(layout) {
  if (!layout) return [];
  const keys = [...Object.values(layout.fields || {}), ...(layout.texts || [])].map((f) => f.font);
  if (layout.signatureText) keys.push(layout.signatureText.font, layout.signatureText.titleFont);
  return keys.filter(Boolean);
}

module.exports = {
  FIELD_KEYS, THEMES, PLACEHOLDERS, fillPlaceholders, STANDARD_FONTS: fontService.STANDARD, defaultLayout, defaultQr, sanitizeLayout, sanitizeSignaturePositions, fontsInLayout,
};
