const fs = require('fs/promises');
const prisma = require('../../config/database');
const eventService = require('../../services/eventService');
const participantService = require('../../services/participantService');
const pdfService = require('../../services/pdfService');
const blastService = require('../../services/blastService');
const audit = require('../../services/auditService');
const storage = require('../../utils/storage');
const AppError = require('../../utils/AppError');
const { safeFilename } = require('../../utils/format');

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
const EVENT_FIELDS = ['title', 'theme', 'description', 'location', 'eventDate', 'certNumberFormat'];
const eventData = (validated) => {
  const data = pick(validated, EVENT_FIELDS);
  if (data.theme === '') data.theme = null;
  return data;
};

// ---------------- CRUD ----------------
exports.list = async (req, res) => {
  const data = await eventService.list(req.user, req.validated);
  res.json({ success: true, ...data });
};

exports.create = async (req, res) => {
  const event = await eventService.create(req.user, eventData(req.validated));
  await audit.log({ req, action: 'EVENT_CREATE', entity: 'Event', entityId: event.id, meta: { title: event.title } });
  res.status(201).json({ success: true, data: event });
};

exports.show = async (req, res) => {
  res.json({ success: true, data: await eventService.getDetail(req.user, req.event.id) });
};

exports.update = async (req, res) => {
  const data = eventData(req.validated);
  const event = await eventService.update(req.event, data);

  // Nomor sertifikat bergantung pada format & tanggal -> nomori ulang bila berubah
  const numberingChanged = (data.certNumberFormat && data.certNumberFormat !== req.event.certNumberFormat)
    || (data.eventDate && data.eventDate.getTime() !== req.event.eventDate.getTime());
  if (numberingChanged) await participantService.renumber(event);

  await audit.log({ req, action: 'EVENT_UPDATE', entity: 'Event', entityId: event.id, meta: { fields: Object.keys(data) } });
  res.json({ success: true, data: event, renumbered: Boolean(numberingChanged) });
};

exports.remove = async (req, res) => {
  await eventService.remove(req.event);
  await audit.log({ req, action: 'EVENT_DELETE', entity: 'Event', entityId: req.event.id, meta: { title: req.event.title } });
  res.json({ success: true, message: 'Event dihapus.' });
};

// ---------------- Template ----------------
exports.uploadTemplate = async (req, res) => {
  const { event, layoutReset } = await eventService.saveTemplate(req.event, req.file);
  await audit.log({ req, action: 'TEMPLATE_UPLOAD', entity: 'Event', entityId: event.id, meta: { width: event.templateWidth, height: event.templateHeight } });
  res.json({
    success: true,
    data: { templateUrl: `/api/events/${event.id}/template/image`, width: event.templateWidth, height: event.templateHeight, layout: event.layout },
    message: layoutReset ? 'Ukuran template berubah, posisi elemen dikembalikan ke default.' : 'Template berhasil diunggah.',
  });
};

exports.templateImage = async (req, res) => {
  if (!req.event.templatePath) throw new AppError('Template belum diunggah.', 404);
  res.set('Cache-Control', 'private, max-age=300');
  res.type('jpg').send(await fs.readFile(storage.absPath(req.event.templatePath)));
};

// ---------------- Preview & workflow ----------------
exports.preview = async (req, res) => {
  const pdf = await pdfService.renderPreview(req.event);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="preview.pdf"', 'Cache-Control': 'no-store' });
  res.send(pdf);
};

exports.submit = async (req, res) => {
  const event = await eventService.submit(req.event);
  await audit.log({ req, action: 'EVENT_SUBMIT', entity: 'Event', entityId: event.id });
  res.json({ success: true, data: event, message: 'Draf diajukan ke Kaprodi untuk disetujui.' });
};

exports.approve = async (req, res) => {
  const event = await eventService.approve(req.event, req.user, req.validated.note);
  await audit.log({ req, action: 'EVENT_APPROVE', entity: 'Event', entityId: event.id, meta: { note: req.validated.note || null } });
  res.json({ success: true, data: event, message: 'Event disetujui dan siap diterbitkan.' });
};

exports.reject = async (req, res) => {
  const event = await eventService.reject(req.event, req.user, req.validated.note);
  await audit.log({ req, action: 'EVENT_REJECT', entity: 'Event', entityId: event.id, meta: { note: req.validated.note } });
  res.json({ success: true, data: event, message: 'Event ditolak. Pengurus HMP dapat merevisi lalu mengajukan ulang.' });
};

exports.publish = async (req, res) => {
  // Penerbitan & pengiriman email terpisah: publish hanya mengunci event dan (opsional) menerbitkan semua.
  // `sendEmail: true` tetap didukung untuk klien API lama.
  const issueAll = req.body?.issueAll !== false;
  const event = await eventService.publish(req.event, { issueAll });
  await audit.log({ req, action: 'EVENT_PUBLISH', entity: 'Event', entityId: event.id, meta: { issueAll } });

  const blast = req.body?.sendEmail === true && issueAll ? await blastService.start(event, { scope: 'pending', actorId: req.user.id }) : null;
  res.status(200).json({
    success: true,
    data: event,
    blast,
    message: issueAll
      ? 'Semua sertifikat diterbitkan dan dapat diakses peserta via web. Kirim email bila diperlukan di tab Peserta.'
      : 'Event dikunci. Pilih peserta yang akan diterbitkan di tab Peserta.',
  });
};

// ---------------- Blast email ----------------
exports.unlock = async (req, res) => {
  if (blastService.isRunning(req.event.id)) throw new AppError('Pengiriman email sedang berjalan. Tunggu sampai selesai sebelum membuka kunci.', 409);
  const { event, issued, emailed } = await eventService.unlock(req.event, req.user, req.validated.note);
  await audit.log({ req, action: 'EVENT_UNLOCK', entity: 'Event', entityId: event.id, meta: { note: req.validated.note, issued, emailed } });
  const parts = ['Kunci dibuka. Event kembali menjadi Draf dan dapat diperbaiki.'];
  if (issued) parts.push(`${issued} sertifikat ditarik dari akses publik sampai diterbitkan ulang.`);
  if (emailed) parts.push(`${emailed} peserta sudah pernah menerima email; kirim ulang setelah diperbaiki.`);
  res.json({ success: true, data: event, message: parts.join(' ') });
};

/** Pratinjau sertifikat peserta (data asli) sebelum diterbitkan; boleh ditampilkan dalam iframe halaman ini. */
exports.participantPreview = async (req, res) => {
  const cert = await prisma.certificate.findFirst({ where: { id: req.params.certificateId, eventId: req.event.id } });
  if (!cert) throw new AppError('Peserta tidak ditemukan.', 404);
  const pdf = await pdfService.renderCertificate(req.event, cert);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="Pratinjau_${safeFilename(cert.participantName)}.pdf"`,
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'self'",
  });
  res.send(pdf);
};

exports.blast = async (req, res) => {
  const { scope, certificateIds } = req.validated;
  const result = await blastService.start(req.event, { scope, certificateIds, actorId: req.user.id });
  if (!result.started && certificateIds?.length && !result.progress) {
    result.reason = 'Peserta terpilih belum diterbitkan atau sudah dicabut. Terbitkan sertifikat terlebih dahulu sebelum mengirim email.';
  }
  if (result.started) await audit.log({ req, action: 'CERT_BLAST_START', entity: 'Event', entityId: req.event.id, meta: { scope: scope || 'pending', total: result.progress.total } });
  let message = result.reason || `Pengiriman email ke ${result.progress.total} peserta dimulai.`;
  const skipped = result.started && certificateIds?.length ? certificateIds.length - result.progress.total : 0;
  if (skipped > 0) message += ` ${skipped} dilewati karena belum terbit atau dicabut.`;
  res.status(result.started ? 202 : 200).json({ success: result.started, ...result, message });
};

exports.blastStatus = async (req, res) => {
  const { stats } = await eventService.getDetail(req.user, req.event.id);
  res.json({ success: true, running: blastService.isRunning(req.event.id), progress: blastService.progress(req.event.id), email: stats.email });
};

// Unduh PDF sertifikat tertentu (internal, untuk penyelenggara)
exports.certificatePdf = async (req, res) => {
  const cert = await prisma.certificate.findFirst({ where: { id: req.params.certificateId, eventId: req.event.id } });
  if (!cert) throw new AppError('Sertifikat tidak ditemukan.', 404);
  const pdf = cert.issuedAt
    ? await pdfService.getCertificatePdf(cert, req.event)
    : await pdfService.renderCertificate(req.event, cert); // draf: render tanpa cache
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="Sertifikat_${safeFilename(cert.participantName)}.pdf"`,
    'Cache-Control': 'no-store',
  });
  res.send(pdf);
};
