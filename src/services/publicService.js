const prisma = require('../config/database');
const { isSignatureValid } = require('../utils/certCrypto');
const { formatDateId, maskEmail } = require('../utils/format');
const featureService = require('./featureService');

const CODE_REGEX = /^[A-Za-z0-9_-]{16,64}$/;

const certInclude = {
  event: { select: { id: true, title: true, theme: true, eventDate: true, organizerType: true, status: true, location: true } },
};

/** Status keabsahan sertifikat (dipakai halaman verifikasi QR & download publik). */
function evaluate(cert) {
  if (!cert) return { valid: false, reason: 'NOT_FOUND', message: 'Sertifikat tidak ditemukan. Kemungkinan QR Code palsu atau salah ketik.' };
  if (cert.event.status !== 'PUBLISHED' || !cert.issuedAt) {
    return { valid: false, reason: 'NOT_ISSUED', message: 'Sertifikat belum diterbitkan.' };
  }
  if (!isSignatureValid(cert)) {
    return { valid: false, reason: 'TAMPERED', message: 'Data sertifikat tidak cocok dengan tanda tangan digital. Sertifikat dinyatakan TIDAK VALID.' };
  }
  if (cert.status === 'REVOKED') return { valid: false, reason: 'REVOKED', message: 'Sertifikat ini telah dicabut oleh penyelenggara.' };
  return { valid: true, reason: null, message: 'Sertifikat ASLI dan terdaftar resmi.' };
}

const brandingService = require('./brandingService');

const organizerLabel = (type) => {
  const brand = brandingService.get();
  return type === 'PRODI' ? brand.orgProdiLabel : brand.orgHmpLabel;
};

function publicView(cert, verdict) {
  if (!cert || verdict.reason === 'NOT_FOUND' || verdict.reason === 'NOT_ISSUED') return { ...verdict, certificate: null };
  return {
    ...verdict,
    certificate: {
      certificateNumber: cert.certificateNumber,
      participantName: cert.participantName,
      participantRole: cert.participantRole,
      participantEmail: maskEmail(cert.participantEmail),
      institution: cert.institution,
      issuedAt: cert.issuedAt,
      issuedAtText: formatDateId(cert.issuedAt),
      event: {
        title: cert.event.title,
        theme: cert.event.theme,
        date: cert.event.eventDate,
        dateText: formatDateId(cert.event.eventDate),
        location: cert.event.location,
        organizer: organizerLabel(cert.event.organizerType),
      },
      downloadUrl: verdict.valid && featureService.isEnabled('public.download') ? `/sertifikat/${cert.verificationCode}/download` : null,
      verifyPath: `/verify/${cert.verificationCode}`,
    },
  };
}

async function verify(code) {
  if (!CODE_REGEX.test(code || '')) return publicView(null, evaluate(null));
  const cert = await prisma.certificate.findUnique({ where: { verificationCode: code }, include: certInclude });
  return publicView(cert, evaluate(cert));
}

/**
 * Pencarian mandiri: input email (semua sertifikat milik email itu) atau nomor sertifikat.
 * Hanya sertifikat terbit & valid yang ditampilkan.
 */
async function search(q) {
  const term = String(q || '').trim();
  const isEmail = term.includes('@');
  const certs = await prisma.certificate.findMany({
    where: {
      ...(isEmail ? { participantEmail: term.toLowerCase() } : { certificateNumber: term }),
      status: 'ACTIVE',
      issuedAt: { not: null },
      event: { status: 'PUBLISHED' },
    },
    include: certInclude,
    orderBy: { issuedAt: 'desc' },
    take: 50,
  });
  return certs
    .map((c) => publicView(c, evaluate(c)))
    .filter((r) => r.valid)
    .map((r) => r.certificate);
}

/** Ambil sertifikat valid untuk diunduh publik. */
async function findDownloadable(code) {
  if (!CODE_REGEX.test(code || '')) return null;
  const cert = await prisma.certificate.findUnique({ where: { verificationCode: code }, include: { event: true } });
  return evaluate(cert).valid ? cert : null;
}

module.exports = { verify, search, findDownloadable, evaluate };
