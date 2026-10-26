const sharp = require('sharp');
const validator = require('validator');
const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const storage = require('../utils/storage');

/**
 * Identitas & tampilan aplikasi yang dikelola Super Admin: logo, warna, nama, tagline,
 * deskripsi, teks beranda/login, label penyelenggara, footer & kontak.
 *
 * Disimpan sebagai satu baris JSON (key "branding") berisi nilai yang BERBEDA dari default,
 * di-cache di memori (seperti featureService) dan disegarkan berkala.
 */
const KEY = 'branding';
const REFRESH_MS = 30 * 1000;
const HEX = /^#[0-9a-f]{6}$/i;

// type: text | textarea | email | url | color ; group: tab di halaman pengaturan
const FIELDS = [
  // ---- Identitas ----
  { key: 'appName', group: 'identity', label: 'Nama aplikasi', max: 60, required: true, def: 'SertifDigital' },
  { key: 'appSubtitle', group: 'identity', label: 'Subjudul di samping logo', max: 100, def: 'Informatika · Universitas Tiga Serangkai' },
  { key: 'logoText', group: 'identity', label: 'Teks logo (dipakai bila belum ada gambar logo)', max: 6, required: true, def: 'TSU' },
  { key: 'unitName', group: 'identity', label: 'Nama unit / program studi', max: 120, required: true, def: 'Program Studi Informatika' },
  { key: 'institutionName', group: 'identity', label: 'Nama institusi', max: 120, required: true, def: 'Universitas Tiga Serangkai' },
  { key: 'tagline', group: 'identity', label: 'Tagline', max: 140, def: 'Sertifikat terverifikasi dengan QR Code bertanda tangan digital.' },
  { key: 'metaDescription', group: 'identity', label: 'Deskripsi aplikasi (mesin pencari & pratinjau tautan)', type: 'textarea', max: 300, def: 'Sistem Manajemen Sertifikat Digital Program Studi Informatika Universitas Tiga Serangkai' },
  { key: 'orgProdiLabel', group: 'identity', label: 'Nama penyelenggara event Prodi', max: 120, required: true, def: 'Program Studi Informatika' },
  { key: 'orgHmpLabel', group: 'identity', label: 'Nama penyelenggara event HMP', max: 120, required: true, def: 'Himpunan Mahasiswa Informatika' },

  // ---- Warna ----
  { key: 'primaryColor', group: 'colors', label: 'Warna utama (header, tombol, sidebar)', type: 'color', required: true, def: '#0c2c5e' },
  { key: 'accentColor', group: 'colors', label: 'Warna aksen (sorotan, tombol aksi, garis)', type: 'color', required: true, def: '#fbb625' },

  // ---- Beranda & login ----
  { key: 'heroBadge', group: 'pages', label: 'Label kecil di atas judul beranda', max: 60, def: 'Prodi Informatika & HMP' },
  { key: 'heroTitle', group: 'pages', label: 'Judul beranda', max: 80, required: true, def: 'Sertifikat Digital' },
  { key: 'heroHighlight', group: 'pages', label: 'Judul beranda (bagian berwarna aksen)', max: 80, def: 'Resmi & Terverifikasi' },
  { key: 'heroDescription', group: 'pages', label: 'Deskripsi beranda', type: 'textarea', max: 400, def: 'Cari, unduh, dan verifikasi keaslian sertifikat kegiatan Program Studi Informatika Universitas Tiga Serangkai — tanpa perlu login.' },
  { key: 'feature1Title', group: 'pages', label: 'Keunggulan 1 — judul', max: 60, def: 'Verifikasi QR Code' },
  { key: 'feature1Desc', group: 'pages', label: 'Keunggulan 1 — keterangan', type: 'textarea', max: 200, def: 'Setiap sertifikat memiliki QR Code bertanda tangan digital untuk mencegah pemalsuan.' },
  { key: 'feature2Title', group: 'pages', label: 'Keunggulan 2 — judul', max: 60, def: 'Unduh PDF Mandiri' },
  { key: 'feature2Desc', group: 'pages', label: 'Keunggulan 2 — keterangan', type: 'textarea', max: 200, def: 'Peserta dapat mencari dan mengunduh sertifikat kapan saja melalui portal publik.' },
  { key: 'feature3Title', group: 'pages', label: 'Keunggulan 3 — judul', max: 60, def: 'Approval Berjenjang' },
  { key: 'feature3Desc', group: 'pages', label: 'Keunggulan 3 — keterangan', type: 'textarea', max: 200, def: 'Draf sertifikat HMP diverifikasi oleh Kaprodi sebelum diterbitkan.' },
  { key: 'loginTitle', group: 'pages', label: 'Judul halaman login', max: 80, def: 'Kelola sertifikat kegiatan' },
  { key: 'loginHighlight', group: 'pages', label: 'Judul login (bagian berwarna aksen)', max: 80, def: 'lebih cepat & aman.' },
  { key: 'loginDescription', group: 'pages', label: 'Deskripsi halaman login', type: 'textarea', max: 300, def: 'Portal internal untuk Kaprodi, Pengurus HMP, dan Super Admin Program Studi Informatika Universitas Tiga Serangkai.' },

  // ---- Footer & kontak ----
  { key: 'footerCopyright', group: 'footer', label: 'Teks hak cipta (setelah © tahun)', max: 150, required: true, def: 'Program Studi Informatika · Universitas Tiga Serangkai' },
  { key: 'footerNote', group: 'footer', label: 'Catatan footer', max: 200, def: 'Sertifikat terverifikasi dengan QR Code bertanda tangan digital.' },
  { key: 'contactAddress', group: 'footer', label: 'Alamat', type: 'textarea', max: 300, def: '' },
  { key: 'contactEmail', group: 'footer', label: 'Email kontak', type: 'email', max: 191, def: '' },
  { key: 'contactPhone', group: 'footer', label: 'Telepon / WhatsApp', max: 40, def: '' },
  { key: 'contactWebsite', group: 'footer', label: 'Situs web', type: 'url', max: 200, def: '' },
  { key: 'socialInstagram', group: 'footer', label: 'Instagram (URL)', type: 'url', max: 200, def: '' },
  { key: 'socialYoutube', group: 'footer', label: 'YouTube (URL)', type: 'url', max: 200, def: '' },
];
const FIELD_MAP = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
const DEFAULTS = Object.fromEntries(FIELDS.map((f) => [f.key, f.def]));

let overrides = {}; // nilai tersimpan (termasuk logoPath)
let loadedAt = 0;
let refreshing = null;

async function load() {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  overrides = row?.value && typeof row.value === 'object' ? row.value : {};
  loadedAt = Date.now();
}

async function refreshIfStale() {
  if (Date.now() - loadedAt < REFRESH_MS) return;
  refreshing ||= load().catch((err) => console.error('[branding] gagal memuat:', err.message)).finally(() => { refreshing = null; });
  await refreshing;
}

// ---------------------------------------------------------------- warna

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgbToHex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (hex, target, amount) => rgbToHex(hexToRgb(hex).map((v, i) => v + (target[i] - v) * amount));
const tint = (hex, a) => mix(hex, [255, 255, 255], a);
const shade = (hex, a) => mix(hex, [0, 0, 0], a);

/** Luminans relatif & rasio kontras WCAG (untuk peringatan keterbacaan). */
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

/**
 * Gradasi warna dari satu warna dasar. Warna utama = tingkat 800 (header/latar gelap),
 * warna aksen = tingkat 400. Nama variabel mengikuti token Tailwind (--color-tsu-*, --color-gold-*).
 */
// Palet bawaan (sama dengan src/styles/input.css) dipakai persis bila warna tidak diubah
const DEFAULT_PRIMARY = {
  50: '#eef4fc', 100: '#d6e4f7', 200: '#adc8ef', 300: '#7aa5e2', 400: '#457bcf', 500: '#2259b5',
  600: '#154594', 700: '#0f3878', 800: '#0c2c5e', 900: '#0a2149', 950: '#06142e',
};
const DEFAULT_ACCENT = {
  50: '#fffaeb', 100: '#fef0c7', 200: '#fde08a', 300: '#fcca4d', 400: '#fbb625', 500: '#f59e0b', 600: '#d97b06', 700: '#b45909',
};

function primaryScale(base) {
  if (base === DEFAULT_PRIMARY[800]) return DEFAULT_PRIMARY;
  return {
    50: tint(base, 0.94), 100: tint(base, 0.86), 200: tint(base, 0.7), 300: tint(base, 0.52), 400: tint(base, 0.34),
    500: tint(base, 0.18), 600: tint(base, 0.08), 700: tint(base, 0.03), 800: base, 900: shade(base, 0.2), 950: shade(base, 0.5),
  };
}
function accentScale(base) {
  if (base === DEFAULT_ACCENT[400]) return DEFAULT_ACCENT;
  return {
    50: tint(base, 0.93), 100: tint(base, 0.8), 200: tint(base, 0.55), 300: tint(base, 0.28), 400: base,
    500: shade(base, 0.06), 600: shade(base, 0.16), 700: shade(base, 0.3),
  };
}

// ---------------------------------------------------------------- baca

/** Semua pengaturan efektif (default + override) + turunan yang dipakai view. */
function get() {
  const b = { ...DEFAULTS };
  for (const f of FIELDS) if (overrides[f.key] !== undefined) b[f.key] = overrides[f.key];
  const version = overrides.version || 0;
  return {
    ...b,
    logoUrl: overrides.logoPath ? `/branding/logo?v=${version}` : null,
    faviconUrl: overrides.logoPath ? `/branding/logo?v=${version}` : '/favicon.svg',
    themeUrl: `/theme.css?v=${version}`,
    hasCustomColors: b.primaryColor.toLowerCase() !== DEFAULTS.primaryColor || b.accentColor.toLowerCase() !== DEFAULTS.accentColor,
    primary: primaryScale(b.primaryColor.toLowerCase()),
    accent: accentScale(b.accentColor.toLowerCase()),
    fullName: [b.appName, b.appSubtitle].filter(Boolean).join(' · '),
    hasContact: Boolean(b.contactAddress || b.contactEmail || b.contactPhone || b.contactWebsite || b.socialInstagram || b.socialYoutube),
  };
}

/** CSS variabel tema (menimpa token Tailwind). Kosong bila warna default. */
function themeCss() {
  const b = get();
  if (!b.hasCustomColors) return '/* warna default */\n';
  const lines = [
    ...Object.entries(b.primary).map(([k, v]) => `--color-tsu-${k}:${v}`),
    ...Object.entries(b.accent).map(([k, v]) => `--color-gold-${k}:${v}`),
  ];
  return `:root{${lines.join(';')}}\n`;
}

const logoPath = () => overrides.logoPath || null;

/** Data untuk halaman pengaturan. */
function adminView() {
  const values = get();
  return {
    fields: FIELDS.map(({ def, ...f }) => ({ ...f, value: values[f.key], defaultValue: def, custom: overrides[f.key] !== undefined })),
    logoUrl: values.logoUrl,
    defaults: DEFAULTS,
  };
}

// ---------------------------------------------------------------- simpan

function sanitize(field, raw) {
  let v = String(raw ?? '').replace(/\r\n?/g, '\n');
  v = field.type === 'textarea' ? v.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim() : v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (field.required && !v) throw new AppError(`${field.label} wajib diisi.`, 422);
  if (field.max && v.length > field.max) throw new AppError(`${field.label} maksimal ${field.max} karakter.`, 422);
  if (!v) return v;
  if (field.type === 'color') {
    if (!HEX.test(v)) throw new AppError(`${field.label} harus berformat #RRGGBB.`, 422);
    return v.toLowerCase();
  }
  if (field.type === 'email' && !validator.isEmail(v)) throw new AppError(`${field.label} tidak valid.`, 422);
  if (field.type === 'url' && !validator.isURL(v, { protocols: ['http', 'https'], require_protocol: true })) {
    throw new AppError(`${field.label} harus berupa URL lengkap (diawali https://).`, 422);
  }
  return v;
}

async function persist(next, user) {
  next.version = (overrides.version || 0) + 1;
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: next, updatedById: user?.id ?? null },
    update: { value: next, updatedById: user?.id ?? null },
  });
  overrides = next;
  loadedAt = Date.now();
}

/** Simpan field yang dikirim saja (field lain tidak diubah). Nilai = default -> override dihapus. */
async function update(input, user) {
  const next = { ...overrides };
  const changed = [];
  for (const [key, raw] of Object.entries(input || {})) {
    const field = FIELD_MAP[key];
    if (!field) continue;
    const v = sanitize(field, raw);
    if (v === field.def) delete next[key];
    else next[key] = v;
    if ((overrides[key] ?? field.def) !== v) changed.push(key);
  }
  if (!changed.length) return { changed };
  await persist(next, user);
  return { changed };
}

async function setLogo(file, user) {
  if (!file) throw new AppError('File logo wajib diunggah.', 422);
  let data;
  try {
    const probe = await sharp(file.buffer, { failOn: 'error' }).metadata();
    if (!['png', 'jpeg', 'webp', 'svg'].includes(probe.format)) throw new Error('format');
    data = await sharp(file.buffer, { failOn: 'error', ...(probe.format === 'svg' ? { density: 300 } : {}) })
      .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: probe.format !== 'svg' })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    throw new AppError('Logo harus berupa gambar PNG, JPG, WEBP, atau SVG yang valid.', 415);
  }
  const old = overrides.logoPath;
  const rel = await storage.saveBuffer('uploads/branding', 'png', data);
  await persist({ ...overrides, logoPath: rel }, user);
  if (old) await storage.removeFile(old);
}

async function removeLogo(user) {
  const old = overrides.logoPath;
  if (!old) return;
  const next = { ...overrides };
  delete next.logoPath;
  await persist(next, user);
  await storage.removeFile(old);
}

/** Kembalikan semua teks & warna ke default. `keepLogo` = logo tidak ikut dihapus. */
async function reset(user, { keepLogo = true } = {}) {
  const old = overrides.logoPath;
  await persist(keepLogo && old ? { logoPath: old } : {}, user);
  if (!keepLogo && old) await storage.removeFile(old);
}

module.exports = {
  FIELDS, DEFAULTS, load, refreshIfStale, get, themeCss, logoPath, adminView, update, setLogo, removeLogo, reset, contrast,
};
