const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { can, blockedByFeature } = require('../services/eventPolicy');

const EDIT_MSG = 'Event tidak dapat diubah pada status saat ini atau Anda bukan penyelenggaranya.';
const ISSUED_MSG = 'Aksi ini hanya tersedia untuk event yang sudah terbit.';
const ACTION_MESSAGES = {
  edit: EDIT_MSG,
  editTemplate: EDIT_MSG,
  editLayout: EDIT_MSG,
  editParticipants: EDIT_MSG,
  deleteEvent: EDIT_MSG,
  blast: ISSUED_MSG,
  revoke: ISSUED_MSG,
  correct: ISSUED_MSG,
  submit: 'Event tidak dapat diajukan pada status saat ini.',
  review: 'Event tidak sedang menunggu persetujuan.',
  publish: 'Event belum dapat diterbitkan pada status saat ini.',
  manageIssued: 'Aksi ini hanya tersedia untuk event yang sudah terbit.',
};

/** Muat event dari :eventId ke req.event. Event yang tidak boleh dilihat dianggap 404. */
async function loadEvent(req, res, next) {
  const event = await prisma.event.findUnique({ where: { id: req.params.eventId } });
  if (!event || !can('view', req.user, event)) throw new AppError('Event tidak ditemukan.', 404);
  req.event = event;
  next();
}

/** Pastikan user boleh melakukan aksi tertentu pada req.event. */
const requireEventPermission = (action) => (req, res, next) => {
  if (can(action, req.user, req.event)) return next();
  const feature = blockedByFeature(action, req.user, req.event);
  if (feature) throw new AppError(`Fitur "${feature}" sedang dinonaktifkan oleh Super Admin.`, 403);
  throw new AppError(ACTION_MESSAGES[action] || 'Akses ditolak.', 403);
};

module.exports = { loadEvent, requireEventPermission };
