const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

const dateId = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });

const formatDateId = (date) => (date ? dateId.format(new Date(date)) : '');

const dayId = new Intl.DateTimeFormat('id-ID', { weekday: 'long', timeZone: 'Asia/Jakarta' });
/** Nama hari, mis. "Sabtu" */
const formatDayId = (date) => (date ? dayId.format(new Date(date)) : '');

/** budi.santoso@gmail.com -> bu********@gmail.com */
function maskEmail(email) {
  const [user, domain] = String(email || '').split('@');
  if (!domain) return '';
  return `${user.slice(0, 2)}${'*'.repeat(Math.max(user.length - 2, 3))}@${domain}`;
}

/** Nama file aman untuk Content-Disposition */
const safeFilename = (str) => String(str).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 80) || 'sertifikat';

/**
 * Format nomor sertifikat.
 * Token: {YYYY} {MM} {ROMAN_MM} {EID} {SEQ:n}
 */
function formatCertNumber(format, { eventDate, eventId, seq }) {
  const d = new Date(eventDate);
  return format
    .replace(/\{YYYY\}/g, String(d.getUTCFullYear()))
    .replace(/\{MM\}/g, String(d.getUTCMonth() + 1).padStart(2, '0'))
    .replace(/\{ROMAN_MM\}/g, ROMAN[d.getUTCMonth()])
    .replace(/\{EID\}/g, eventId.slice(-5).toUpperCase())
    .replace(/\{SEQ(?::(\d))?\}/g, (_m, pad) => String(seq).padStart(Number(pad || 1), '0'));
}

const CERT_FORMAT_REGEX = /^(?=.*\{SEQ(?::\d)?\})[A-Za-z0-9/\-._ {}:]+$/;

module.exports = { formatDateId, formatDayId, maskEmail, safeFilename, formatCertNumber, CERT_FORMAT_REGEX };
