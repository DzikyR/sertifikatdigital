const { parse } = require('csv-parse/sync');
const ExcelJS = require('exceljs');
const validator = require('validator');
const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { formatCertNumber } = require('../utils/format');
const { generateVerificationCode, signCertificate } = require('../utils/certCrypto');

const MAX_ROWS = 2000;

// Header yang diterima (tidak peka huruf besar/kecil)
const HEADER_ALIASES = {
  name: ['nama', 'name', 'nama peserta', 'nama lengkap', 'full name'],
  email: ['email', 'e-mail', 'surel', 'alamat email'],
  role: ['peran', 'role', 'sebagai', 'jabatan'],
  institution: ['instansi', 'institusi', 'institution', 'asal', 'universitas', 'asal instansi'],
};
// Urutan kolom template; dipakai juga bila file tidak memiliki baris header
const DEFAULT_ORDER = { name: 0, email: 1, role: 2, institution: 3 };

const TEMPLATE_HEADERS = ['nama', 'email', 'peran', 'instansi'];
const TEMPLATE_ROWS = [
  ['Dziky Ridhwanullah, S.Kom., M.Kom', 'dziky@tsu.ac.id', 'Peserta', 'Universitas Tiga Serangkai'],
  ['Siti Aminah', 'siti@example.com', 'Pembicara', ''],
  ['Budi Santoso', 'budi@example.com', 'Panitia', 'HMP Informatika'],
];
const ROLE_SUGGESTIONS = ['Peserta', 'Pembicara', 'Moderator', 'Panitia', 'Juri', 'Pemenang'];

// Template CSV memakai titik koma: Excel berbahasa Indonesia langsung membaginya ke kolom.
// Nilai yang mengandung pemisah/koma/kutip diapit tanda kutip.
const csvCell = (v) => (/[;,"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const CSV_TEMPLATE = `${[TEMPLATE_HEADERS, ...TEMPLATE_ROWS].map((r) => r.map(csvCell).join(';')).join('\r\n')}\r\n`;

/** Template Excel: kolom rapi, header tebal, saran isian peran, dan lembar petunjuk. */
async function buildXlsxTemplate() {
  const wb = new ExcelJS.Workbook();
  wb.creator = require('./brandingService').get().fullName;
  const ws = wb.addWorksheet('Peserta', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'nama', key: 'nama', width: 42 },
    { header: 'email', key: 'email', width: 32 },
    { header: 'peran', key: 'peran', width: 16 },
    { header: 'instansi', key: 'instansi', width: 34 },
  ];
  TEMPLATE_ROWS.forEach((r) => ws.addRow(r));
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0C2C5E' } };
  header.alignment = { vertical: 'middle' };
  header.height = 20;
  // Saran peran (boleh diisi nilai lain)
  for (let r = 2; r <= MAX_ROWS + 1; r += 1) {
    ws.getCell(`C${r}`).dataValidation = {
      type: 'list', allowBlank: true, showErrorMessage: false, formulae: [`"${ROLE_SUGGESTIONS.join(',')}"`],
    };
  }

  const help = wb.addWorksheet('Petunjuk');
  help.getColumn(1).width = 100;
  [
    'PETUNJUK PENGISIAN DATA PESERTA',
    '',
    '1. Isi data di lembar "Peserta". Satu baris = satu peserta. Jangan ubah judul kolom di baris pertama.',
    '2. Kolom "nama" dan "email" wajib diisi. Nama ditulis persis seperti yang akan dicetak di sertifikat, termasuk gelar.',
    '   Contoh: Dziky Ridhwanullah, S.Kom., M.Kom',
    '3. Kolom "peran" boleh dikosongkan (otomatis "Peserta"). Pilih dari daftar atau ketik sendiri.',
    '4. Kolom "instansi" opsional.',
    '5. Satu email boleh terdaftar lebih dari sekali asalkan perannya berbeda (mis. Pembicara dan Peserta).',
    '6. Hapus baris contoh sebelum mengunggah. Simpan sebagai .xlsx lalu unggah di tab Peserta.',
  ].forEach((t, i) => { help.getCell(`A${i + 1}`).value = t; });
  help.getCell('A1').font = { bold: true, size: 13 };

  return wb.xlsx.writeBuffer();
}

// Bersihkan teks: hapus karakter kontrol & spasi berlebih, cegah CSV/formula injection saat diekspor ulang
const clean = (v, max) => String(v ?? '')
  .replace(/[\u0000-\u001F\u007F]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/^[=+\-@]+/, '')
  .slice(0, max);

const normEmail = (v) => clean(v, 191).replace(/^mailto:/i, '').toLowerCase();
const looksLikeEmail = (v) => validator.isEmail(normEmail(v));

/** Nilai sel Excel -> teks (sel bisa berupa hyperlink, rich text, rumus, atau tanggal). */
function cellText(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.text !== undefined) return cellText(v.text);
    if (v.result !== undefined) return cellText(v.result);
    if (v.error) return '';
    return '';
  }
  return String(v);
}

/** Baca file Excel (lembar "Peserta" atau lembar pertama yang berisi data). */
async function readXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new AppError('File Excel tidak dapat dibaca. Pastikan formatnya .xlsx (bukan .xls lama).', 422);
  }
  const sheets = wb.worksheets.filter((s) => s.actualRowCount > 0);
  const ws = sheets.find((s) => s.name.trim().toLowerCase() === 'peserta') || sheets[0];
  if (!ws) return [];
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, line) => {
    if (rows.length > MAX_ROWS + 1) return;
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    rows.push({ line, cells: Array.from(values, (v) => cellText(v).trim()) });
  });
  return rows;
}

function readCsv(buffer) {
  let text = buffer.toString('utf8').replace(/^﻿/, '');
  let offset = 0;
  // Baris "sep=;" yang ditulis Excel bukan data
  const sep = text.match(/^sep=(.)\r?\n/i);
  if (sep) { text = text.slice(sep[0].length); offset = 1; }
  const first = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const count = (ch) => first.split(ch).length - 1;
  const delimiter = sep?.[1] || [';', '\t', ','].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ',');
  try {
    return parse(text, {
      delimiter, skip_empty_lines: true, relax_column_count: true, relax_quotes: true, trim: true, info: true,
    }).map(({ record, info }) => ({ line: info.lines + offset, cells: record }));
  } catch (err) {
    throw new AppError(`File CSV tidak dapat dibaca: ${err.message}`, 422);
  }
}

function mapHeaders(cells) {
  const map = {};
  cells.forEach((h, idx) => {
    const key = String(h).trim().toLowerCase().replace(/\s+/g, ' ');
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(key) && map[field] === undefined) map[field] = idx;
    }
  });
  return map;
}

/**
 * Perbaiki baris yang terpecah karena koma di dalam nilai yang tidak diapit tanda kutip,
 * mis. `Dziky Ridhwanullah, S.Kom., M.Kom,dziky@tsu.ac.id,...` -> nama terbaca 3 sel.
 * Posisi kolom email dipakai sebagai patokan: sel berlebih sebelum email digabung ke nama,
 * sel berlebih di ujung digabung ke kolom terakhir (biasanya instansi).
 */
function realign(cells, map, width) {
  let row = [...cells];
  while (row.length > width && row[row.length - 1] === '') row.pop();
  if (row.length <= width) return { row, fixed: false };

  let fixed = false;
  const emailIdx = row.findIndex(looksLikeEmail);
  const shift = emailIdx - map.email;
  if (emailIdx !== -1 && shift > 0 && map.name < map.email) {
    const merged = row.slice(map.name, map.name + shift + 1).filter(Boolean).join(', ');
    row = [...row.slice(0, map.name), merged, ...row.slice(map.name + shift + 1)];
    fixed = true;
  }
  if (row.length > width) {
    const lastField = Object.entries(map).find(([, idx]) => idx === width - 1)?.[0];
    if (lastField && lastField !== 'email') {
      row = [...row.slice(0, width - 1), row.slice(width - 1).filter(Boolean).join(', ')];
      fixed = true;
    }
  }
  return { row, fixed };
}

/** Baca & validasi file peserta (.xlsx atau .csv). */
async function parseParticipants(buffer) {
  const isXlsx = buffer.length > 4 && buffer.readUInt32BE(0) === 0x504b0304; // "PK\3\4" (zip)
  const rows = (isXlsx ? await readXlsx(buffer) : readCsv(buffer))
    .filter((r) => r.cells.some((c) => String(c).trim() !== ''));
  if (!rows.length) throw new AppError('File kosong.', 422);

  let map = mapHeaders(rows[0].cells);
  let dataRows = rows.slice(1);
  let width = rows[0].cells.length;
  while (width > 0 && !String(rows[0].cells[width - 1] ?? '').trim()) width -= 1;
  if (map.name === undefined || map.email === undefined) {
    // Tanpa header: terima bila baris pertama sudah berisi email (urutan kolom = template)
    if (!rows[0].cells.some(looksLikeEmail)) {
      throw new AppError('Baris pertama wajib berisi judul kolom "nama" dan "email" (lihat template).', 422);
    }
    map = { ...DEFAULT_ORDER };
    dataRows = rows;
    width = TEMPLATE_HEADERS.length;
  }
  if (!dataRows.length) throw new AppError('File hanya berisi judul kolom, belum ada data peserta.', 422);
  if (dataRows.length > MAX_ROWS) throw new AppError(`Maksimal ${MAX_ROWS} peserta per import.`, 422);

  const valid = [];
  const errors = [];
  const fixes = [];

  dataRows.forEach(({ line, cells }) => {
    const { row, fixed } = realign(cells.map((c) => String(c ?? '').trim()), map, width);
    const name = clean(row[map.name], 150);
    const email = normEmail(row[map.email]);
    const role = clean(map.role !== undefined ? row[map.role] : '', 60) || 'Peserta';
    const institution = clean(map.institution !== undefined ? row[map.institution] : '', 150) || null;

    if (!name) return errors.push({ line, message: 'Nama kosong.' });
    if (!validator.isEmail(email)) {
      const hint = cells.length > width ? ' Jika nama/instansi mengandung koma, apit dengan tanda kutip atau gunakan template Excel.' : '';
      return errors.push({ line, message: `Email tidak valid: "${email}".${hint}` });
    }
    if (fixed) fixes.push({ line, message: `Koma di dalam nama/instansi dibaca otomatis: "${name}"${institution ? ` - ${institution}` : ''}.` });
    return valid.push({ line, name, email, role, institution });
  });

  return { valid, errors, fixes };
}

/**
 * Buat record sertifikat untuk tiap peserta baru. Duplikat (email + peran yang sama di
 * event ini, baik di file maupun di DB) dilewati. Nomor urut dicadangkan secara atomik.
 */
async function importParticipants(event, buffer) {
  const { valid, errors, fixes } = await parseParticipants(buffer);

  const existing = await prisma.certificate.findMany({
    where: { eventId: event.id },
    select: { participantEmail: true, participantRole: true },
  });
  const seen = new Set(existing.map((c) => `${c.participantEmail}|${c.participantRole.toLowerCase()}`));

  const fresh = [];
  const skipped = [];
  for (const p of valid) {
    const key = `${p.email}|${p.role.toLowerCase()}`;
    if (seen.has(key)) {
      skipped.push({ line: p.line, message: `${p.email} (${p.role}) sudah terdaftar.` });
    } else {
      seen.add(key);
      fresh.push(p);
    }
  }

  if (fresh.length) await createCertificates(event, fresh);

  return { imported: fresh.length, skipped, errors, fixes, totalRows: valid.length + errors.length };
}

async function createCertificates(event, participants) {
  try {
    await prisma.$transaction(async (tx) => {
      const { certNumberSeq: last } = await tx.event.update({
        where: { id: event.id },
        data: { certNumberSeq: { increment: participants.length } },
        select: { certNumberSeq: true },
      });
      const start = last - participants.length + 1;

      const data = participants.map((p, i) => {
        const cert = {
          eventId: event.id,
          certificateNumber: formatCertNumber(event.certNumberFormat, { eventDate: event.eventDate, eventId: event.id, seq: start + i }),
          participantName: p.name,
          participantEmail: p.email,
          participantRole: p.role,
          institution: p.institution,
          verificationCode: generateVerificationCode(),
        };
        return { ...cert, signatureHash: signCertificate(cert) };
      });
      await tx.certificate.createMany({ data });
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new AppError('Nomor sertifikat bentrok dengan event lain. Ubah format nomor sertifikat (mis. tambahkan {EID}).', 409);
    }
    throw err;
  }
}

/** Nomori ulang semua sertifikat (dipanggil jika format nomor / tanggal event berubah sebelum terbit). */
async function renumber(event) {
  const certs = await prisma.certificate.findMany({ where: { eventId: event.id }, orderBy: { createdAt: 'asc' } });
  try {
    await prisma.$transaction(async (tx) => {
      // Tahap 1: nomor sementara agar tidak bentrok unique constraint saat menukar nomor
      for (const c of certs) {
        await tx.certificate.update({ where: { id: c.id }, data: { certificateNumber: `tmp-${c.id}` } });
      }
      let seq = 0;
      for (const c of certs) {
        seq += 1;
        const certificateNumber = formatCertNumber(event.certNumberFormat, { eventDate: event.eventDate, eventId: event.id, seq });
        await tx.certificate.update({
          where: { id: c.id },
          data: { certificateNumber, signatureHash: signCertificate({ ...c, certificateNumber }) },
        });
      }
      await tx.event.update({ where: { id: event.id }, data: { certNumberSeq: seq } });
    }, { timeout: 60000 });
  } catch (err) {
    if (err.code === 'P2002') throw new AppError('Format nomor menghasilkan nomor yang bentrok dengan event lain.', 409);
    throw err;
  }
}

/**
 * Terbitkan sertifikat (dapat diakses publik: verifikasi, pencarian, unduh).
 * `ids` kosong = semua yang belum terbit. Sertifikat yang sudah terbit / dicabut dilewati.
 */
async function issue(event, ids) {
  const where = { eventId: event.id, issuedAt: null, status: 'ACTIVE' };
  if (ids?.length) where.id = { in: ids };
  const { count } = await prisma.certificate.updateMany({ where, data: { issuedAt: new Date() } });
  return count;
}

// Filter status penerbitan di tabel manajemen
const ISSUE_FILTERS = {
  issued: { issuedAt: { not: null }, status: 'ACTIVE' },
  unissued: { issuedAt: null, status: 'ACTIVE' },
  revoked: { status: 'REVOKED' },
};

async function list(event, { q, emailStatus, issueStatus, page = 1, pageSize = 50 }) {
  const where = { eventId: event.id, ...(ISSUE_FILTERS[issueStatus] || {}) };
  if (emailStatus) Object.assign(where, { emailStatus, issuedAt: { not: null } });
  if (q) {
    where.OR = [
      { participantName: { contains: q, mode: 'insensitive' } },
      { participantEmail: { contains: q, mode: 'insensitive' } },
      { certificateNumber: { contains: q, mode: 'insensitive' } },
    ];
  }
  const [total, items] = await prisma.$transaction([
    prisma.certificate.count({ where }),
    prisma.certificate.findMany({
      where,
      orderBy: { certificateNumber: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, certificateNumber: true, participantName: true, participantEmail: true,
        participantRole: true, institution: true, status: true, issuedAt: true,
        emailStatus: true, emailSentAt: true, emailError: true, downloadCount: true, verificationCode: true,
      },
    }),
  ]);
  return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

function cleanParticipant(input) {
  const p = {
    name: clean(input.name, 150),
    email: normEmail(input.email),
    role: clean(input.role, 60) || 'Peserta',
    institution: clean(input.institution, 150) || null,
  };
  if (!p.name) throw new AppError('Nama peserta wajib diisi.', 422);
  if (!validator.isEmail(p.email)) throw new AppError(`Email tidak valid: "${p.email}".`, 422);
  return p;
}

/** Tolak bila email + peran yang sama sudah ada di event (kecuali sertifikat `exceptId`). */
async function assertNotDuplicate(event, p, exceptId) {
  const dup = await prisma.certificate.findFirst({
    where: {
      eventId: event.id,
      participantEmail: p.email,
      participantRole: { equals: p.role, mode: 'insensitive' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (dup) throw new AppError(`${p.email} sudah terdaftar sebagai ${p.role} di event ini.`, 409);
}

/** Tambah satu peserta secara manual (validasi & cek duplikat sama seperti import). */
async function addOne(event, input) {
  const p = cleanParticipant(input);
  await assertNotDuplicate(event, p);

  await createCertificates(event, [p]);
  return prisma.certificate.findFirst({ where: { eventId: event.id, participantEmail: p.email, participantRole: p.role } });
}

/**
 * Ubah data peserta. Nomor sertifikat & kode verifikasi tetap; tanda tangan HMAC dihitung
 * ulang karena nama/email/peran termasuk data yang dilindungi.
 */
async function updateOne(event, certificateId, input) {
  const cert = await prisma.certificate.findFirst({ where: { id: certificateId, eventId: event.id } });
  if (!cert) throw new AppError('Peserta tidak ditemukan.', 404);
  const p = cleanParticipant(input);
  await assertNotDuplicate(event, p, cert.id);

  const data = { participantName: p.name, participantEmail: p.email, participantRole: p.role, institution: p.institution };
  try {
    return await prisma.certificate.update({
      where: { id: cert.id },
      data: { ...data, signatureHash: signCertificate({ ...cert, ...data }) },
    });
  } catch (err) {
    if (err.code === 'P2002') throw new AppError(`${p.email} sudah terdaftar sebagai ${p.role} di event ini.`, 409);
    throw err;
  }
}

/** Hapus beberapa peserta sekaligus (hanya yang milik event ini). */
async function removeMany(event, ids) {
  const { count } = await prisma.certificate.deleteMany({ where: { eventId: event.id, id: { in: ids } } });
  if (!count) throw new AppError('Tidak ada peserta yang dihapus. Data mungkin sudah berubah, muat ulang halaman.', 404);
  return count;
}

async function remove(event, certificateId) {
  const { count } = await prisma.certificate.deleteMany({ where: { id: certificateId, eventId: event.id } });
  if (!count) throw new AppError('Peserta tidak ditemukan.', 404);
}

async function removeAll(event) {
  await prisma.$transaction([
    prisma.certificate.deleteMany({ where: { eventId: event.id } }),
    prisma.event.update({ where: { id: event.id }, data: { certNumberSeq: 0 } }),
  ]);
}

async function setStatus(event, certificateId, status) {
  const cert = await prisma.certificate.findFirst({ where: { id: certificateId, eventId: event.id } });
  if (!cert) throw new AppError('Sertifikat tidak ditemukan.', 404);
  return prisma.certificate.update({ where: { id: cert.id }, data: { status } });
}

module.exports = {
  CSV_TEMPLATE, buildXlsxTemplate, parseParticipants, importParticipants, addOne, updateOne, issue, renumber, list, remove, removeMany, removeAll, setStatus,
};
