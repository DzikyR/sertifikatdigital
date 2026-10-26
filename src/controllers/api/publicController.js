const publicService = require('../../services/publicService');
const pdfService = require('../../services/pdfService');
const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const { safeFilename } = require('../../utils/format');

exports.verify = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: await publicService.verify(req.params.code) });
};

exports.search = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const items = await publicService.search(req.validated.q);
  res.json({ success: true, data: items, message: items.length ? null : 'Sertifikat tidak ditemukan.' });
};

/** Unduh PDF publik (tanpa login) berdasarkan kode verifikasi yang tidak bisa ditebak. */
exports.download = async (req, res) => {
  const cert = await publicService.findDownloadable(req.params.code);
  if (!cert) throw new AppError('Sertifikat tidak ditemukan atau tidak valid.', 404);

  const pdf = await pdfService.getCertificatePdf(cert, cert.event);
  await prisma.certificate.update({ where: { id: cert.id }, data: { downloadCount: { increment: 1 } } });

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="Sertifikat_${safeFilename(cert.participantName)}.pdf"`,
    'Cache-Control': 'private, no-store',
  });
  res.send(pdf);
};
