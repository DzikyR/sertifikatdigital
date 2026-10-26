const adminService = require('../../services/adminService');
const audit = require('../../services/auditService');
const featureService = require('../../services/featureService');
const { ROLE_LABELS } = require('../../utils/constants');

exports.listUsers = async (req, res) => {
  res.json({ success: true, ...(await adminService.listUsers(req.validated)) });
};

exports.createUser = async (req, res) => {
  const user = await adminService.createUser(req.validated);
  await audit.log({ req, action: 'USER_CREATE', entity: 'User', entityId: user.id, meta: { email: user.email, role: user.role } });
  res.status(201).json({ success: true, data: user, message: 'User berhasil dibuat.' });
};

exports.updateUser = async (req, res) => {
  const { userId, ...changes } = req.validated;
  const user = await adminService.updateUser(req.user, userId, changes);
  await audit.log({ req, action: 'USER_UPDATE', entity: 'User', entityId: user.id, meta: changes });
  res.json({ success: true, data: user, message: 'User diperbarui.' });
};

exports.resetPassword = async (req, res) => {
  await adminService.resetPassword(req.validated.userId, req.validated.password);
  await audit.log({ req, action: 'USER_RESET_PASSWORD', entity: 'User', entityId: req.validated.userId });
  res.json({ success: true, message: 'Password direset. Semua sesi user tersebut telah dikeluarkan.' });
};

// ---------------- Permintaan akses ----------------
exports.listAccessRequests = async (req, res) => {
  res.json({ success: true, data: await adminService.listAccessRequests() });
};

exports.approveRequest = async (req, res) => {
  const user = await adminService.approveRequest(req.validated.userId, req.validated.role);
  await audit.log({ req, action: 'ACCESS_APPROVE', entity: 'User', entityId: user.id, meta: { email: user.email, role: user.role } });
  res.json({ success: true, data: user, message: `${user.name} disetujui. User sekarang bisa masuk dengan Google.` });
};

exports.rejectRequest = async (req, res) => {
  const user = await adminService.rejectRequest(req.validated.userId);
  await audit.log({ req, action: 'ACCESS_REJECT', entity: 'User', entityId: user.id, meta: { email: user.email } });
  res.json({ success: true, data: user, message: `Permintaan akses ${user.email} ditolak.` });
};

exports.deleteRequest = async (req, res) => {
  await adminService.deleteRequest(req.validated.userId);
  await audit.log({ req, action: 'ACCESS_DELETE', entity: 'User', entityId: req.validated.userId });
  res.json({ success: true, message: 'Permintaan dihapus. Email tersebut dapat mengajukan ulang.' });
};

// ---------------- Pengaturan fitur per role ----------------
exports.listFeatures = (req, res) => {
  res.json({ success: true, data: featureService.matrix() });
};

exports.setFeature = async (req, res) => {
  const { key, role, enabled } = req.validated;
  const result = await featureService.set(key, role, enabled, req.user.id);
  await audit.log({ req, action: 'FEATURE_TOGGLE', entity: 'Feature', entityId: key, meta: result });
  const who = result.role === 'GLOBAL' ? 'semua pengguna' : ROLE_LABELS[result.role];
  res.json({ success: true, data: result, message: `"${featureService.label(key)}" ${enabled ? 'diaktifkan' : 'dinonaktifkan'} untuk ${who}.` });
};

exports.resetFeatures = async (req, res) => {
  await featureService.reset();
  await audit.log({ req, action: 'FEATURE_RESET', entity: 'Feature' });
  res.json({ success: true, message: 'Semua fitur dikembalikan ke pengaturan awal (aktif).' });
};

exports.listLogs = async (req, res) => {
  res.json({ success: true, ...(await adminService.listLogs(req.validated)) });
};

// ---------------- Pengaturan aplikasi (tampilan & identitas) ----------------
const brandingService = require('../../services/brandingService');

exports.getSettings = (req, res) => {
  res.json({ success: true, data: brandingService.adminView() });
};

exports.updateSettings = async (req, res) => {
  const { changed } = await brandingService.update(req.body?.values, req.user);
  if (changed.length) await audit.log({ req, action: 'SETTINGS_UPDATE', entity: 'AppSetting', entityId: 'branding', meta: { fields: changed } });
  res.json({
    success: true,
    data: { changed },
    message: changed.length ? `${changed.length} pengaturan disimpan dan langsung berlaku.` : 'Tidak ada perubahan.',
  });
};

exports.uploadLogo = async (req, res) => {
  await brandingService.setLogo(req.file, req.user);
  await audit.log({ req, action: 'SETTINGS_LOGO', entity: 'AppSetting', entityId: 'branding' });
  res.json({ success: true, data: { logoUrl: brandingService.get().logoUrl }, message: 'Logo aplikasi diperbarui.' });
};

exports.deleteLogo = async (req, res) => {
  await brandingService.removeLogo(req.user);
  await audit.log({ req, action: 'SETTINGS_LOGO_DELETE', entity: 'AppSetting', entityId: 'branding' });
  res.json({ success: true, message: 'Logo dihapus; aplikasi kembali memakai teks logo.' });
};

exports.resetSettings = async (req, res) => {
  const keepLogo = req.body?.keepLogo !== false;
  await brandingService.reset(req.user, { keepLogo });
  await audit.log({ req, action: 'SETTINGS_RESET', entity: 'AppSetting', entityId: 'branding', meta: { keepLogo } });
  res.json({ success: true, message: 'Pengaturan tampilan dikembalikan ke default.' });
};
