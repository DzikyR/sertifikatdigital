const crypto = require('crypto');
const config = require('../config');

/**
 * Anti-pemalsuan sertifikat (2 lapis):
 * 1. verificationCode: 144-bit acak (base64url) di URL QR -> tidak bisa ditebak/dienumerasi.
 * 2. signatureHash: HMAC-SHA256 (secret server) atas data inti sertifikat. Saat verifikasi,
 *    HMAC dihitung ulang dari data DB; jika ada yang mengubah nama/nomor/event langsung di DB
 *    tanpa secret, sertifikat otomatis dinyatakan TIDAK VALID.
 */

const generateVerificationCode = () => crypto.randomBytes(18).toString('base64url');

function canonicalPayload(cert) {
  return [
    'v1',
    cert.eventId,
    cert.certificateNumber,
    cert.participantName,
    String(cert.participantEmail).toLowerCase(),
    cert.participantRole,
    cert.verificationCode,
  ].join('|');
}

function signCertificate(cert) {
  return crypto.createHmac('sha256', config.qrSigningSecret).update(canonicalPayload(cert)).digest('hex');
}

function isSignatureValid(cert) {
  if (!cert?.signatureHash) return false;
  const expected = Buffer.from(signCertificate(cert), 'hex');
  const actual = Buffer.from(cert.signatureHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

const verifyUrl = (code) => `${config.appUrl.replace(/\/$/, '')}/verify/${encodeURIComponent(code)}`;

module.exports = { generateVerificationCode, signCertificate, isSignatureValid, verifyUrl };
