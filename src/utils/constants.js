const ROLES = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN', // Kaprodi & Admin Prodi (hak akses sama)
  HMP: 'HMP',
});

const ROLE_LABELS = Object.freeze({
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Kaprodi / Admin Prodi',
  HMP: 'Pengurus HMP',
});

const EVENT_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  PUBLISHED: 'PUBLISHED',
});

// Label & gaya badge status (warna status selalu disertai teks label)
const EVENT_STATUS_META = Object.freeze({
  DRAFT: { label: 'Draf', cls: 'bg-slate-100 text-slate-700 ring-slate-300' },
  PENDING_APPROVAL: { label: 'Menunggu Persetujuan', cls: 'bg-amber-50 text-amber-800 ring-amber-300' },
  APPROVED: { label: 'Disetujui', cls: 'bg-sky-50 text-sky-800 ring-sky-300' },
  REJECTED: { label: 'Ditolak', cls: 'bg-red-50 text-red-700 ring-red-300' },
  PUBLISHED: { label: 'Terbit', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
});

const EMAIL_STATUS_META = Object.freeze({
  PENDING: { label: 'Belum dikirim', cls: 'bg-slate-100 text-slate-700 ring-slate-300' },
  QUEUED: { label: 'Antre', cls: 'bg-sky-50 text-sky-800 ring-sky-300' },
  SENT: { label: 'Terkirim', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
  FAILED: { label: 'Gagal', cls: 'bg-red-50 text-red-700 ring-red-300' },
});

const ORGANIZER_LABELS = Object.freeze({ PRODI: 'Prodi', HMP: 'HMP' });

module.exports = { ROLES, ROLE_LABELS, EVENT_STATUS, EVENT_STATUS_META, EMAIL_STATUS_META, ORGANIZER_LABELS };
