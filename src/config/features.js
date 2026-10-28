/**
 * Registry fitur yang bisa diaktifkan/nonaktifkan Super Admin.
 *
 * - `roles`  : fitur per role; Super Admin mengatur nilainya per role yang tercantum.
 * - `global` : fitur sistem (berlaku untuk semua orang, termasuk publik).
 * Semua fitur default AKTIF. Super Admin sendiri tidak pernah dibatasi.
 *
 * Halaman verifikasi QR (/verify) sengaja TIDAK bisa dimatikan: menonaktifkannya akan
 * membuat semua sertifikat yang sudah tercetak tidak bisa diverifikasi.
 */
const FEATURES = [
  // ---- Pengelolaan event ----
  { key: 'event.create', group: 'Pengelolaan Event', label: 'Membuat event baru', roles: ['ADMIN', 'HMP'] },
  { key: 'event.template', group: 'Pengelolaan Event', label: 'Mengunggah template & tanda tangan', roles: ['ADMIN', 'HMP'] },
  { key: 'event.builder', group: 'Pengelolaan Event', label: 'Mengatur layout di Certificate Builder', roles: ['ADMIN', 'HMP'] },
  { key: 'event.participants', group: 'Pengelolaan Event', label: 'Import & hapus peserta', roles: ['ADMIN', 'HMP'] },
  { key: 'event.delete', group: 'Pengelolaan Event', label: 'Menghapus event', roles: ['ADMIN', 'HMP'] },

  // ---- Workflow ----
  { key: 'event.submit', group: 'Workflow', label: 'Mengajukan draf ke Kaprodi', roles: ['HMP'] },
  { key: 'approval.review', group: 'Workflow', label: 'Menyetujui / menolak draf HMP', roles: ['ADMIN'] },
  { key: 'event.publish', group: 'Workflow', label: 'Menerbitkan sertifikat', roles: ['ADMIN', 'HMP'] },
  { key: 'event.unlock', group: 'Workflow', label: 'Membuka kunci event yang sudah disetujui / terbit', roles: ['ADMIN'] },

  // ---- Sertifikat terbit ----
  { key: 'cert.blast', group: 'Sertifikat', label: 'Mengirim / mengirim ulang email sertifikat', roles: ['ADMIN', 'HMP'] },
  { key: 'cert.correct', group: 'Sertifikat', label: 'Menarik sertifikat terpilih untuk diperbaiki (event tetap terbit)', roles: ['ADMIN', 'HMP'] },
  { key: 'cert.revoke', group: 'Sertifikat', label: 'Mencabut / mengaktifkan kembali sertifikat', roles: ['ADMIN', 'HMP'] },
  { key: 'cert.download', group: 'Sertifikat', label: 'Mengunduh PDF sertifikat peserta (internal)', roles: ['ADMIN', 'HMP'] },

  // ---- Fitur sistem (global) ----
  {
    key: 'public.search', group: 'Portal Publik', label: 'Portal pencarian sertifikat (/cari)', global: true,
    description: 'Peserta mencari sertifikat dengan email atau nomor sertifikat.',
  },
  {
    key: 'public.download', group: 'Portal Publik', label: 'Peserta mengunduh PDF sertifikat', global: true,
    description: 'Tombol unduh di halaman pencarian, verifikasi, dan tautan di email.',
  },
  {
    key: 'auth.google', group: 'Autentikasi', label: 'Login dengan Google', global: true,
    description: 'Jika dimatikan, semua pengguna harus login dengan password.',
  },
  {
    key: 'auth.accessRequest', group: 'Autentikasi', label: 'Permintaan akses via Google', global: true,
    description: 'Akun Google kampus yang belum terdaftar dapat mengajukan akses ke Super Admin.',
  },
];

const FEATURE_MAP = Object.fromEntries(FEATURES.map((f) => [f.key, f]));
const MANAGED_ROLES = ['ADMIN', 'HMP'];

module.exports = { FEATURES, FEATURE_MAP, MANAGED_ROLES };
