const prisma = require('../../config/database');
const statsService = require('../../services/statsService');
const eventService = require('../../services/eventService');
const participantService = require('../../services/participantService');
const adminService = require('../../services/adminService');
const featureService = require('../../services/featureService');
const { FIELD_KEYS } = require('../../services/layoutService');
const { ROLE_LABELS } = require('../../utils/constants');

// ---------------- Dashboard ----------------
exports.dashboard = async (req, res) => {
  const stats = await statsService.dashboard(req.user);
  res.render('pages/dashboard/index', {
    title: 'Dashboard',
    breadcrumbs: [{ label: 'Dashboard' }],
    stats,
    roleLabel: ROLE_LABELS[req.user.role],
    scripts: ['/js/pages/dashboard.js'],
  });
};

// ---------------- Event ----------------
exports.eventList = async (req, res) => {
  const filters = { page: 1, pageSize: 15, ...req.validated };
  const data = await eventService.list(req.user, filters);
  res.render('pages/events/index', {
    title: 'Event Sertifikat',
    breadcrumbs: [{ label: 'Event Sertifikat' }],
    ...data,
    filters,
  });
};

exports.eventNew = (req, res) => {
  res.render('pages/events/form', {
    title: 'Buat Event',
    breadcrumbs: [{ label: 'Event Sertifikat', href: '/events' }, { label: 'Buat Event' }],
    event: null,
  });
};

exports.eventShow = async (req, res) => {
  const [event, participants] = await Promise.all([
    eventService.getDetail(req.user, req.event.id),
    participantService.list(req.event, { page: 1, pageSize: 100, ...req.validated }),
  ]);
  res.render('pages/events/show', {
    title: event.title,
    breadcrumbs: [{ label: 'Event Sertifikat', href: '/events' }, { label: event.title }],
    event,
    participants,
    query: req.validated,
    scripts: ['/js/pages/event-show.js'],
  });
};

exports.eventBuilder = (req, res) => {
  res.render('pages/events/builder', {
    title: `Builder - ${req.event.title}`,
    breadcrumbs: [
      { label: 'Event Sertifikat', href: '/events' },
      { label: req.event.title, href: `/events/${req.event.id}` },
      { label: 'Certificate Builder' },
    ],
    event: req.event,
    fieldKeys: FIELD_KEYS,
    scripts: ['/vendor/fabric.min.js', '/js/pages/builder.js'],
  });
};

// ---------------- Persetujuan (Kaprodi/Admin Prodi) ----------------
exports.approvals = async (req, res) => {
  const select = {
    id: true, title: true, eventDate: true, status: true, submittedAt: true, reviewedAt: true, reviewNote: true,
    createdBy: { select: { name: true } }, reviewedBy: { select: { name: true } },
    _count: { select: { certificates: true, signatures: true } },
  };
  const [pending, history] = await Promise.all([
    prisma.event.findMany({ where: { status: 'PENDING_APPROVAL' }, orderBy: { submittedAt: 'asc' }, select }),
    prisma.event.findMany({ where: { organizerType: 'HMP', reviewedAt: { not: null } }, orderBy: { reviewedAt: 'desc' }, take: 15, select }),
  ]);
  res.render('pages/approvals/index', {
    title: 'Persetujuan',
    breadcrumbs: [{ label: 'Persetujuan' }],
    pending,
    history,
  });
};

// ---------------- Super Admin ----------------
exports.users = async (req, res) => {
  const filters = { page: 1, pageSize: 20, ...req.validated };
  const [data, requests] = await Promise.all([adminService.listUsers(filters), adminService.listAccessRequests()]);
  res.render('pages/admin/users', {
    title: 'Kelola User',
    breadcrumbs: [{ label: 'Super Admin' }, { label: 'Kelola User' }],
    ...data,
    requests,
    filters,
    roles: ROLE_LABELS,
    scripts: ['/js/pages/admin-users.js'],
  });
};

exports.features = (req, res) => {
  res.render('pages/admin/features', {
    title: 'Fitur & Akses',
    breadcrumbs: [{ label: 'Super Admin' }, { label: 'Fitur & Akses' }],
    groups: featureService.matrix(),
    roles: ROLE_LABELS,
    scripts: ['/js/pages/admin-features.js'],
  });
};

exports.settings = (req, res) => {
  res.render('pages/admin/settings', {
    title: 'Pengaturan Aplikasi',
    breadcrumbs: [{ label: 'Super Admin' }, { label: 'Pengaturan Aplikasi' }],
    settings: require('../../services/brandingService').adminView(),
    scripts: ['/js/pages/admin-settings.js'],
  });
};

exports.logs = async (req, res) => {
  const filters = { page: 1, pageSize: 50, ...req.validated };
  const data = await adminService.listLogs(filters);
  res.render('pages/admin/logs', {
    title: 'Log Sistem',
    breadcrumbs: [{ label: 'Super Admin' }, { label: 'Log Sistem' }],
    ...data,
    filters,
  });
};
