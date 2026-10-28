const { ROLES, EVENT_STATUS: S } = require('../utils/constants');
const featureService = require('./featureService');

/**
 * Aturan workflow event:
 *
 *  Event PRODI (dibuat Kaprodi/Admin Prodi):  DRAFT ──publish──▶ PUBLISHED   (tanpa approval)
 *  Event HMP   (dibuat Pengurus HMP):
 *      DRAFT ──submit──▶ PENDING_APPROVAL ──approve──▶ APPROVED ──publish──▶ PUBLISHED
 *        ▲                      │
 *        └──── (revisi) ◀── REJECTED ◀──reject──┘
 *
 *  - Lihat  : ADMIN semua event; HMP hanya event HMP (dikelola bersama pengurus).
 *  - Ubah   : hanya pihak penyelenggara, dan hanya saat DRAFT / REJECTED
 *             (template, TTD, layout & peserta terkunci setelah diajukan).
 *  - SUPER_ADMIN tidak mengelola event (fokus user & monitoring).
 *  - Setelah PUBLISHED (event terkunci), penerbitan per peserta & pengiriman email dikelola
 *    terpisah: sertifikat baru bisa diakses publik setelah diterbitkan (issuedAt), dan email
 *    hanya dikirim bila diminta.
 *  - Perbaikan kecil setelah terbit tidak perlu Buka Kunci: sertifikat terpilih ditarik (`correct`),
 *    datanya diubah, lalu diterbitkan ulang; sertifikat lain tetap terbit & valid.
 *
 * Setiap aksi = aturan role/status (`base`) + fitur yang bisa dimatikan Super Admin (`feature`).
 */

const ownerRole = (event) => (event.organizerType === 'PRODI' ? ROLES.ADMIN : ROLES.HMP);
const EDITABLE = [S.DRAFT, S.REJECTED];

const canView = (user, event) => user.role === ROLES.ADMIN || (user.role === ROLES.HMP && event.organizerType === 'HMP');
const canEdit = (user, event) => user.role === ownerRole(event) && EDITABLE.includes(event.status);
const isIssuedManager = (user, event) => event.status === S.PUBLISHED
  && (user.role === ROLES.ADMIN || user.role === ownerRole(event));

const ACTIONS = {
  view: { base: canView },
  edit: { base: canEdit }, // info event (judul, tanggal, format nomor)
  editTemplate: { base: canEdit, feature: 'event.template' },
  editLayout: { base: canEdit, feature: 'event.builder' },
  editParticipants: { base: canEdit, feature: 'event.participants' },
  deleteEvent: { base: canEdit, feature: 'event.delete' },

  submit: {
    base: (user, event) => user.role === ROLES.HMP && event.organizerType === 'HMP' && EDITABLE.includes(event.status),
    feature: 'event.submit',
  },
  review: {
    base: (user, event) => user.role === ROLES.ADMIN && event.organizerType === 'HMP' && event.status === S.PENDING_APPROVAL,
    feature: 'approval.review',
  },
  publish: {
    base: (user, event) => {
      if (event.organizerType === 'PRODI') return user.role === ROLES.ADMIN && event.status === S.DRAFT;
      return [ROLES.HMP, ROLES.ADMIN].includes(user.role) && event.status === S.APPROVED;
    },
    feature: 'event.publish',
  },

  // Kaprodi/Admin Prodi dapat membuka kunci event (kembali ke DRAF) untuk memperbaiki kesalahan
  unlock: {
    base: (user, event) => user.role === ROLES.ADMIN && [S.APPROVED, S.PUBLISHED].includes(event.status),
    feature: 'event.unlock',
  },
  manageIssued: { base: isIssuedManager },
  issue: { base: isIssuedManager, feature: 'event.publish' },
  blast: { base: isIssuedManager, feature: 'cert.blast' },
  revoke: { base: isIssuedManager, feature: 'cert.revoke' },
  correct: { base: isIssuedManager, feature: 'cert.correct' },
  downloadPdf: { base: canView, feature: 'cert.download' },
};

const featureOn = (action, user) => !ACTIONS[action].feature || featureService.isEnabled(ACTIONS[action].feature, user.role);

const can = (action, user, event) => Boolean(user && event && ACTIONS[action]
  && ACTIONS[action].base(user, event) && featureOn(action, user));

/** Aksi diizinkan oleh role/status, tetapi fiturnya dimatikan Super Admin -> label fitur, selain itu null. */
function blockedByFeature(action, user, event) {
  const a = ACTIONS[action];
  if (!a?.feature || !user || !event || !a.base(user, event) || featureOn(action, user)) return null;
  return featureService.label(a.feature);
}

/** Ringkasan izin untuk dikirim ke frontend (menentukan tombol yang tampil). */
const permissionsFor = (user, event) => Object.fromEntries(Object.keys(ACTIONS).map((a) => [a, can(a, user, event)]));

module.exports = { can, blockedByFeature, permissionsFor, ownerRole };
