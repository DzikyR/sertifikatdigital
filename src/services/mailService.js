const path = require('path');
const ejs = require('ejs');
const config = require('../config');
const { transporter, mailFrom } = require('../config/mail');
const { formatDateId, safeFilename } = require('../utils/format');
const { verifyUrl } = require('../utils/certCrypto');
const featureService = require('./featureService');
const brandingService = require('./brandingService');

const TEMPLATE = path.join(config.paths.views, 'emails/certificate.ejs');

const downloadUrl = (code) => `${config.appUrl.replace(/\/$/, '')}/sertifikat/${encodeURIComponent(code)}/download`;

async function sendCertificate(cert, event, pdfBuffer) {
  const data = {
    participantName: cert.participantName,
    participantRole: cert.participantRole,
    certificateNumber: cert.certificateNumber,
    eventTitle: event.title,
    eventDate: formatDateId(event.eventDate),
    downloadUrl: featureService.isEnabled('public.download') ? downloadUrl(cert.verificationCode) : null,
    verifyUrl: verifyUrl(cert.verificationCode),
    brand: brandingService.get(),
    appUrl: config.appUrl.replace(/\/$/, ''),
  };
  const html = await ejs.renderFile(TEMPLATE, data);

  return transporter.sendMail({
    from: mailFrom,
    to: { name: cert.participantName, address: cert.participantEmail },
    subject: `Sertifikat ${event.title}`,
    html,
    text: `Halo ${data.participantName},\n\nSertifikat Anda untuk kegiatan "${data.eventTitle}" (${data.eventDate}) terlampir.\n`
      + `Nomor: ${data.certificateNumber}\n${data.downloadUrl ? `Unduh: ${data.downloadUrl}\n` : ''}Verifikasi: ${data.verifyUrl}\n`,
    attachments: [{
      filename: `Sertifikat_${safeFilename(cert.participantName)}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    }],
  });
}

module.exports = { sendCertificate, downloadUrl };
