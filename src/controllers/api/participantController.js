const participantService = require('../../services/participantService');
const audit = require('../../services/auditService');
const AppError = require('../../utils/AppError');

exports.list = async (req, res) => {
  res.json({ success: true, ...(await participantService.list(req.event, req.validated)) });
};

exports.importCsv = async (req, res) => {
  if (!req.file) throw new AppError('File peserta (.xlsx atau .csv) wajib diunggah (field "file").', 422);
  const result = await participantService.importParticipants(req.event, req.file.buffer);
  await audit.log({ req, action: 'PARTICIPANT_IMPORT', entity: 'Event', entityId: req.event.id, meta: { imported: result.imported, skipped: result.skipped.length, errors: result.errors.length } });
  const fixed = result.fixes.length ? `, ${result.fixes.length} baris diperbaiki otomatis` : '';
  res.json({
    success: true,
    data: result,
    message: `${result.imported} peserta diimpor, ${result.skipped.length} duplikat dilewati, ${result.errors.length} baris tidak valid${fixed}.`,
  });
};

exports.csvTemplate = (req, res) => {
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="template_peserta.csv"' });
  res.send(`﻿${participantService.CSV_TEMPLATE}`);
};

exports.xlsxTemplate = async (req, res) => {
  const buffer = await participantService.buildXlsxTemplate();
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="template_peserta.xlsx"',
  });
  res.send(Buffer.from(buffer));
};

exports.remove = async (req, res) => {
  await participantService.remove(req.event, req.params.certificateId);
  res.json({ success: true, message: 'Peserta dihapus.' });
};

exports.create = async (req, res) => {
  const cert = await participantService.addOne(req.event, req.validated);
  await audit.log({ req, action: 'PARTICIPANT_ADD', entity: 'Certificate', entityId: cert.id, meta: { email: cert.participantEmail } });
  res.status(201).json({
    success: true,
    data: { id: cert.id, certificateNumber: cert.certificateNumber },
    message: `${cert.participantName} ditambahkan (${cert.certificateNumber}).`,
  });
};

exports.update = async (req, res) => {
  const cert = await participantService.updateOne(req.event, req.params.certificateId, req.validated);
  await audit.log({ req, action: 'PARTICIPANT_UPDATE', entity: 'Certificate', entityId: cert.id, meta: { email: cert.participantEmail } });
  res.json({ success: true, data: { id: cert.id }, message: `Data ${cert.participantName} diperbarui.` });
};

exports.issue = async (req, res) => {
  const ids = req.validated.ids || [];
  const count = await participantService.issue(req.event, ids);
  await audit.log({ req, action: 'CERT_ISSUE', entity: 'Event', entityId: req.event.id, meta: { count, selected: ids.length || 'all' } });
  const skipped = ids.length ? ids.length - count : 0;
  res.json({
    success: true,
    data: { issued: count, skipped },
    message: count
      ? `${count} sertifikat diterbitkan dan kini dapat diakses peserta via web.${skipped ? ` ${skipped} dilewati (sudah terbit/dicabut).` : ''}`
      : 'Tidak ada sertifikat yang perlu diterbitkan.',
  });
};

exports.removeMany = async (req, res) => {
  const count = await participantService.removeMany(req.event, req.validated.ids);
  await audit.log({ req, action: 'PARTICIPANT_BULK_DELETE', entity: 'Event', entityId: req.event.id, meta: { count } });
  res.json({ success: true, data: { deleted: count }, message: `${count} peserta dihapus.` });
};

exports.removeAll = async (req, res) => {
  await participantService.removeAll(req.event);
  await audit.log({ req, action: 'PARTICIPANT_CLEAR', entity: 'Event', entityId: req.event.id });
  res.json({ success: true, message: 'Semua peserta dihapus.' });
};

const setStatus = (status, action, message) => async (req, res) => {
  const cert = await participantService.setStatus(req.event, req.params.certificateId, status);
  await audit.log({ req, action, entity: 'Certificate', entityId: cert.id, meta: { certificateNumber: cert.certificateNumber } });
  res.json({ success: true, data: { id: cert.id, status: cert.status }, message });
};

exports.revoke = setStatus('REVOKED', 'CERT_REVOKE', 'Sertifikat dicabut dan kini dinyatakan tidak valid.');
exports.restore = setStatus('ACTIVE', 'CERT_RESTORE', 'Sertifikat diaktifkan kembali.');
