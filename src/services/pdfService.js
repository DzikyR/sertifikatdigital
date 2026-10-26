const fs = require('fs/promises');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const storage = require('../utils/storage');
const { formatDateId, formatDayId } = require('../utils/format');
const { verifyUrl } = require('../utils/certCrypto');
const fontService = require('./fontService');
const brandingService = require('./brandingService');
const { fontsInLayout, fillPlaceholders } = require('./layoutService');

/**
 * Halaman PDF diskalakan ke lebar A4 (landscape 842pt / portrait 595pt) dengan rasio
 * template asli. Semua koordinat layout (px template) dikali faktor skala `s`.
 */
const A4_LONG = 841.89;
const A4_SHORT = 595.28;

function pageGeometry(w, h) {
  const pageWidth = w >= h ? A4_LONG : A4_SHORT;
  const s = pageWidth / w;
  return { s, pageWidth, pageHeight: h * s };
}

/** Muat aset event sekali (template, TTD, file font) agar batch generate tidak membaca disk berulang. */
async function loadAssets(event) {
  if (!event.templatePath || !event.layout) throw new AppError('Template atau layout event belum lengkap.', 422);
  const [signatures, logos] = await Promise.all([
    prisma.eventSignature.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' } }),
    prisma.eventLogo.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' } }),
  ]);
  const read = (items) => Promise.all(items.map(async (it) => ({ ...it, buffer: await fs.readFile(storage.absPath(it.imagePath)) })));
  const [template, fonts, sigs, logoImgs] = await Promise.all([
    fs.readFile(storage.absPath(event.templatePath)),
    fontService.loadFontBuffers(fontsInLayout(event.layout)),
    read(signatures),
    read(logos),
  ]);
  return { template, fonts, signatures: sigs, logos: logoImgs };
}

/**
 * Pilih font di dokumen. Font standar dipakai langsung; font berkas didaftarkan per dokumen
 * (PDFKit hanya menyematkan glyph yang dipakai). Font yang filenya tidak ada -> Helvetica.
 */
function useFont(doc, key) {
  if (fontService.STANDARD[key]) return doc.font(key);
  if (doc.registeredFonts?.has(key)) {
    try {
      return doc.font(key);
    } catch (err) {
      console.error('[pdf] font tidak dapat dipakai', key, err.message);
      doc.registeredFonts.delete(key);
    }
  }
  return doc.font('Helvetica');
}

/** Tulis teks satu baris; font otomatis diperkecil bila melebihi maxWidth. */
function drawText(doc, text, f, s) {
  if (!text) return;
  const maxWidth = f.maxWidth * s;
  let size = f.fontSize * s;
  useFont(doc, f.font).fontSize(size);
  while (doc.widthOfString(text) > maxWidth && size > 6) {
    size -= 0.5;
    doc.fontSize(size);
  }
  const anchorX = f.x * s;
  const boxX = f.align === 'left' ? anchorX : f.align === 'right' ? anchorX - maxWidth : anchorX - maxWidth / 2;
  const top = f.y * s - doc.currentLineHeight() / 2;
  doc.fillColor(f.color).text(text, boxX, top, { width: maxWidth, align: f.align, lineBreak: false });
}

/**
 * Teks kustom multi-baris: dibungkus otomatis pada lebar maxWidth. (x, y) mengikuti konvensi
 * field (x = jangkar perataan, y = tengah vertikal blok). Jarak antarbaris = fontSize x lineHeight,
 * sama dengan kanvas builder.
 */
function drawTextBlock(doc, text, t, s) {
  if (!text.trim()) return;
  const size = t.fontSize * s;
  const width = t.maxWidth * s;
  useFont(doc, t.font).fontSize(size);
  const lineGap = size * t.lineHeight - doc.currentLineHeight(true);
  const opts = { width, align: t.align, lineGap };
  const height = doc.heightOfString(text, opts) - lineGap; // tanpa celah setelah baris terakhir
  const anchorX = t.x * s;
  const boxX = t.align === 'left' ? anchorX : t.align === 'right' ? anchorX - width : anchorX - width / 2;
  doc.fillColor(t.color).text(text, boxX, t.y * s - height / 2, opts);
}

function drawSignature(doc, sg, style, s) {
  const x = sg.posX * s;
  const y = sg.posY * s;
  const w = sg.width * s;
  const h = sg.height * s;
  doc.image(sg.buffer, x, y, { fit: [w, h], align: 'center', valign: 'center' });

  if (!sg.showSignerText || (!sg.signerName && !sg.signerTitle)) return;
  const textWidth = Math.max(w * 1.6, 120 * s);
  const textX = x + w / 2 - textWidth / 2;
  let cursor = y + h + 2 * s;
  doc.fillColor(style.color);
  if (sg.signerName) {
    useFont(doc, style.font).fontSize(style.fontSize * s);
    doc.text(sg.signerName, textX, cursor, { width: textWidth, align: 'center', underline: true, lineBreak: false });
    cursor += doc.currentLineHeight() * 1.1;
  }
  if (sg.signerTitle) {
    useFont(doc, style.titleFont).fontSize(style.fontSize * 0.85 * s);
    doc.text(sg.signerTitle, textX, cursor, { width: textWidth, align: 'center', lineBreak: false });
  }
}

/**
 * Render satu sertifikat menjadi Buffer PDF.
 * @param {object} event   record Event (dengan layout)
 * @param {object} cert    { certificateNumber, participantName, participantRole, verificationCode }
 * @param {object} [assets] hasil loadAssets(event) untuk batch
 */
async function renderCertificate(event, cert, assets) {
  const { template, signatures, fonts, logos = [] } = assets || await loadAssets(event);
  const { s, pageWidth, pageHeight } = pageGeometry(event.templateWidth, event.templateHeight);
  const { fields, qr, signatureText } = event.layout;

  const doc = new PDFDocument({
    size: [pageWidth, pageHeight],
    margin: 0,
    info: {
      Title: `Sertifikat ${cert.participantName} - ${event.title}`,
      Author: `${brandingService.get().unitName} ${brandingService.get().institutionName}`,
      Subject: cert.certificateNumber,
      Keywords: `verify:${cert.verificationCode}`,
    },
  });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.registeredFonts = new Set();
  for (const [key, buffer] of fonts || []) {
    doc.registerFont(key, buffer);
    doc.registeredFonts.add(key);
  }

  doc.image(template, 0, 0, { width: pageWidth, height: pageHeight });

  // Logo di bawah lapisan teks; gambar di-fit proporsional ke kotaknya
  logos.forEach((lg) => {
    doc.image(lg.buffer, lg.posX * s, lg.posY * s, { fit: [lg.width * s, lg.height * s], align: 'center', valign: 'center' });
  });

  const values = {
    participantName: cert.participantName,
    certificateNumber: cert.certificateNumber,
    eventName: event.title,
    eventTheme: event.theme || '',
    eventDate: formatDateId(event.eventDate),
    participantRole: cert.participantRole,
  };
  for (const [key, f] of Object.entries(fields || {})) {
    drawText(doc, values[key] ? `${f.prefix || ''}${values[key]}` : '', f, s);
  }

  const placeholders = {
    nama: cert.participantName,
    peran: cert.participantRole,
    instansi: cert.institution || '',
    nomor: cert.certificateNumber,
    kegiatan: event.title,
    tema: event.theme || '',
    hari: formatDayId(event.eventDate),
    tanggal: values.eventDate,
    lokasi: event.location || '',
  };
  (event.layout.texts || []).forEach((t) => drawTextBlock(doc, fillPlaceholders(t.text, placeholders), t, s));

  const style = signatureText || { fontSize: 24, font: 'Helvetica-Bold', titleFont: 'Helvetica', color: '#0f172a' };
  signatures.forEach((sg) => drawSignature(doc, sg, style, s));

  if (qr) {
    const png = await QRCode.toBuffer(verifyUrl(cert.verificationCode), {
      errorCorrectionLevel: 'M', margin: 1, width: Math.max(256, Math.round(qr.size * 1.5)),
    });
    doc.image(png, qr.x * s, qr.y * s, { width: qr.size * s, height: qr.size * s });
  }

  doc.end();
  return done;
}

const pdfRelPath = (cert) => `certificates/${cert.eventId}/${cert.id}.pdf`;

/**
 * Ambil PDF sertifikat yang sudah terbit dari cache disk, atau generate & simpan.
 * Layout terkunci setelah terbit, sehingga cache aman dipakai ulang.
 */
async function getCertificatePdf(cert, event, assets) {
  const rel = cert.pdfPath || pdfRelPath(cert);
  if (cert.pdfPath && await storage.exists(rel)) return fs.readFile(storage.absPath(rel));

  const buffer = await renderCertificate(event, cert, assets);
  await storage.writeAt(rel, buffer);
  if (cert.pdfPath !== rel) await prisma.certificate.update({ where: { id: cert.id }, data: { pdfPath: rel } });
  return buffer;
}

/** Preview dengan data contoh (untuk builder sebelum terbit). */
function renderPreview(event) {
  return renderCertificate(event, {
    participantName: 'Nama Lengkap Peserta, S.Kom.',
    certificateNumber: 'INF/CONTOH/2026/0001',
    participantRole: 'Peserta',
    institution: 'Universitas Tiga Serangkai',
    verificationCode: 'PREVIEW-TIDAK-VALID',
  });
}

module.exports = { loadAssets, renderCertificate, getCertificatePdf, renderPreview };
