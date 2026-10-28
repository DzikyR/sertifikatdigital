const fs = require('fs/promises');
const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const storage = require('../../utils/storage');
const signatureService = require('../../services/signatureService');
const logoService = require('../../services/logoService');
const layoutService = require('../../services/layoutService');
const fontService = require('../../services/fontService');
const audit = require('../../services/auditService');
const { serializeSignature } = require('../../services/eventService');
const { permissionsFor } = require('../../services/eventPolicy');
const { formatDateId, formatDayId } = require('../../utils/format');


/** Contoh nilai isian otomatis untuk pratinjau kanvas (data peserta = contoh). */
const placeholderSample = (event) => ({
  nama: 'Nama Lengkap Peserta, S.Kom.',
  peran: 'Peserta',
  instansi: 'Universitas Tiga Serangkai',
  nomor: 'INF/XXXXX/2026/0001',
  kegiatan: event.title,
  tema: event.theme || '',
  hari: formatDayId(event.eventDate),
  tanggal: formatDateId(event.eventDate),
  lokasi: event.location || '',
});

// ---------------- Builder data & layout ----------------

/** Semua data yang dibutuhkan canvas builder dalam satu request. */
exports.getBuilder = async (req, res) => {
  const event = req.event;
  const [signatures, logos] = await Promise.all([
    prisma.eventSignature.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' } }),
    prisma.eventLogo.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' } }),
  ]);
  res.json({
    success: true,
    data: {
      eventId: event.id,
      title: event.title,
      status: event.status,
      template: event.templatePath
        ? { url: `/api/events/${event.id}/template/image`, width: event.templateWidth, height: event.templateHeight }
        : null,
      layout: event.layout,
      signatures: signatures.map(serializeSignature),
      logos: logos.map(logoService.serializeLogo),
      fonts: await fontService.listFonts(),
      themes: layoutService.THEMES,
      placeholders: Object.entries(layoutService.PLACEHOLDERS).map(([key, label]) => ({
        key, label, sample: placeholderSample(event)[key],
      })),
      fieldKeys: layoutService.FIELD_KEYS,
      permissions: permissionsFor(req.user, event),
      currentUser: { id: req.user.id, role: req.user.role },
    },
  });
};

/**
 * Simpan layout dari builder: { layout: { fields, qr, signatureText }, signatures: [{ id, posX, posY, width, height }] }
 * Layout & posisi TTD disimpan dalam satu transaksi.
 */
exports.saveLayout = async (req, res) => {
  const event = req.event;
  if (!event.templatePath) throw new AppError('Unggah template terlebih dahulu.', 422);
  const dims = { width: event.templateWidth, height: event.templateHeight };

  const layout = layoutService.sanitizeLayout(req.body?.layout, dims, await fontService.validKeys());
  const positions = layoutService.sanitizeSignaturePositions(req.body?.signatures, dims);

  const logoPositions = layoutService.sanitizeSignaturePositions(req.body?.logos, dims, 'logo');

  const owned = new Set((await prisma.eventSignature.findMany({ where: { eventId: event.id }, select: { id: true } })).map((s) => s.id));
  const unknown = positions.find((p) => !owned.has(p.id));
  if (unknown) throw new AppError('Data TTD tidak sesuai dengan event ini.', 422);
  const ownedLogos = new Set((await prisma.eventLogo.findMany({ where: { eventId: event.id }, select: { id: true } })).map((l) => l.id));
  if (logoPositions.some((p) => !ownedLogos.has(p.id))) throw new AppError('Data logo tidak sesuai dengan event ini.', 422);

  await prisma.$transaction([
    prisma.event.update({ where: { id: event.id }, data: { layout } }),
    ...positions.map(({ id, ...pos }) => prisma.eventSignature.update({ where: { id }, data: pos })),
    ...logoPositions.map(({ id, ...pos }) => prisma.eventLogo.update({ where: { id }, data: pos })),
  ]);

  await audit.log({ req, action: 'LAYOUT_SAVE', entity: 'Event', entityId: event.id });
  res.json({ success: true, data: { layout }, message: 'Layout tersimpan.' });
};

// ---------------- Multi TTD ----------------
exports.listSignatures = async (req, res) => {
  const signatures = await prisma.eventSignature.findMany({ where: { eventId: req.event.id }, orderBy: { sortOrder: 'asc' } });
  res.json({ success: true, data: signatures.map(serializeSignature) });
};

exports.createSignature = async (req, res) => {
  const signature = await signatureService.create(req.event, req.validated);
  await audit.log({ req, action: 'SIGNATURE_USE', entity: 'Event', entityId: req.event.id, meta: { label: signature.label, librarySignatureId: signature.librarySignatureId } });
  res.status(201).json({ success: true, data: serializeSignature(signature), message: `Tanda tangan "${signature.label}" dipakai. Atur posisinya di Builder.` });
};

exports.updateSignature = async (req, res) => {
  const sig = await signatureService.update(req.event, req.params.signatureId, req.validated);
  res.json({ success: true, data: serializeSignature(sig) });
};

exports.deleteSignature = async (req, res) => {
  await signatureService.remove(req.event, req.params.signatureId);
  await audit.log({ req, action: 'SIGNATURE_DETACH', entity: 'Event', entityId: req.event.id, meta: { signatureId: req.params.signatureId } });
  res.json({ success: true, message: 'Tanda tangan dilepas dari event.' });
};

exports.signatureImage = async (req, res) => {
  const sig = await signatureService.findInEvent(req.event, req.params.signatureId);
  res.set('Cache-Control', 'private, max-age=300');
  res.type('png').send(await fs.readFile(storage.absPath(sig.imagePath)));
};

// ---------------- Logo ----------------

exports.createLogo = async (req, res) => {
  const { logo, warning } = await logoService.create(req.event, req.file, { label: req.validated.label });
  await audit.log({ req, action: 'LOGO_UPLOAD', entity: 'Event', entityId: req.event.id, meta: { label: logo.label } });
  res.status(201).json({ success: true, data: logoService.serializeLogo(logo), warning, message: `Logo "${logo.label}" ditambahkan. Atur posisinya di Builder.` });
};

exports.deleteLogo = async (req, res) => {
  await logoService.remove(req.event, req.params.logoId);
  await audit.log({ req, action: 'LOGO_DELETE', entity: 'Event', entityId: req.event.id, meta: { logoId: req.params.logoId } });
  res.json({ success: true, message: 'Logo dihapus.' });
};

exports.logoImage = async (req, res) => {
  const logo = await logoService.findInEvent(req.event, req.params.logoId);
  res.set('Cache-Control', 'private, max-age=300');
  res.type('png').send(await fs.readFile(storage.absPath(logo.imagePath)));
};
